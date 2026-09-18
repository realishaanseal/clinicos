"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@/lib/users";
import { appPath } from "@/lib/base-path";

/** Any button can open the search with this event; Ctrl+K / ⌘K does too. */
export const OPEN_SEARCH = "clinicos:open-search";
export const openSearch = () => window.dispatchEvent(new Event(OPEN_SEARCH));

type PatientHit = { id: string; name: string; age: number | null; sex: string | null; phone: string | null };
type Item = { key: string; label: string; hint: string; run: () => void };

const PAGES: { href: string; label: string; who: "desk" | "admin" | "all" }[] = [
  { href: "/", label: "Today", who: "desk" },
  { href: "/patients", label: "Patients", who: "desk" },
  { href: "/admin", label: "Clinic admin", who: "admin" },
  { href: "/admin/users", label: "People", who: "admin" },
  { href: "/admin/audit", label: "Activity log", who: "admin" },
  { href: "/account/password", label: "Change your password", who: "all" },
];

/**
 * Search from anywhere (backlog #19): Ctrl+K or ⌘K, then a name or a phone
 * number. A doctor lands on the patient's record; the front desk adds them to
 * today's list and can go straight on to the next name. Pages are listed too.
 *
 * It only ever offers what the account may do, and the server checks again:
 * patient search is the front desk's capability, so a clinic admin without it
 * gets pages only. No animation — this is a clinical screen.
 */
export default function QuickSearch({ role, isAdmin }: { role: Role; isAdmin: boolean }) {
  const router = useRouter();
  const dlg = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<PatientHit[]>([]);
  const [active, setActive] = useState(0);
  const [status, setStatus] = useState("");
  const [searching, setSearching] = useState(false);

  const finds = role !== "admin"; // doctors and the front desk
  const admin = role === "admin" || isAdmin;

  const open = useCallback(() => {
    const d = dlg.current;
    if (!d || d.open) return;
    setStatus("");
    d.showModal();
    input.current?.focus();
  }, []);
  const close = () => dlg.current?.close();

  useEffect(() => {
    const d = dlg.current;
    // Light dismiss where the browser supports it; the click handler below
    // covers the rest.
    d?.setAttribute("closedby", "any");
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        open();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_SEARCH, open);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_SEARCH, open);
    };
  }, [open]);

  // Patients, a moment after typing stops. A slower answer to an older query
  // is dropped rather than shown over a newer one.
  useEffect(() => {
    const term = q.trim();
    if (!finds || !term) {
      setHits([]);
      setSearching(false);
      return;
    }
    const ctl = new AbortController();
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(appPath(`/api/patients?q=${encodeURIComponent(term)}`), { signal: ctl.signal });
        const data = await res.json();
        setHits(res.ok ? (data.patients as PatientHit[]).slice(0, 7) : []);
      } catch {
        /* superseded, or offline: keep what was there */
      } finally {
        if (!ctl.signal.aborted) setSearching(false);
      }
    }, 150);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q, finds]);

  useEffect(() => setActive(0), [q, hits.length]);

  async function addToToday(p: PatientHit) {
    setStatus(`Adding ${p.name}…`);
    try {
      const res = await fetch(appPath("/api/queue"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId: p.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't add them to today's list.");
      setStatus(
        data.alreadyQueued
          ? `${p.name} is already on today's list — token ${data.entry.token}.`
          : `${p.name} added to today's list — token ${data.entry.token}.`
      );
      // Ready for the next name at once.
      setQ("");
      input.current?.focus();
      router.refresh();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  }

  const term = q.trim().toLowerCase();
  const items: Item[] = [
    ...hits.map((p) => ({
      key: `p-${p.id}`,
      label: p.name,
      hint: [
        [p.age !== null ? `${p.age}` : null, p.sex].filter(Boolean).join(" · "),
        p.phone,
        role === "doctor" ? "open record" : "add to today's list",
      ]
        .filter(Boolean)
        .join("  ·  "),
      run: () => {
        if (role === "doctor") {
          close();
          router.push(`/patients/${p.id}`);
        } else {
          addToToday(p);
        }
      },
    })),
    ...PAGES.filter((pg) => (pg.who === "all" || (pg.who === "desk" ? finds : admin)) && pg.label.toLowerCase().includes(term)).map(
      (pg) => ({
        key: `g-${pg.href}`,
        label: pg.label,
        hint: "page",
        run: () => {
          close();
          router.push(pg.href);
        },
      })
    ),
  ];
  const optionId = (i: number) => `${listId}-${i}`;

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (items.length ? (i + 1) % items.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (items.length ? (i - 1 + items.length) % items.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      items[active]?.run();
    }
  }

  // Safari has no closedby yet: a click on the backdrop lands on the dialog
  // element itself, outside its box.
  function onDialogClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target !== e.currentTarget) return;
    const r = e.currentTarget.getBoundingClientRect();
    const inside = r.top <= e.clientY && e.clientY <= r.bottom && r.left <= e.clientX && e.clientX <= r.right;
    if (!inside) close();
  }

  const empty = term && !searching && items.length === 0;

  return (
    <dialog
      ref={dlg}
      className="qs noprint"
      aria-label="Search"
      onClick={onDialogClick}
      onClose={() => {
        setQ("");
        setHits([]);
      }}
    >
      <input
        ref={input}
        className="qs-input"
        role="combobox"
        aria-expanded={items.length > 0}
        aria-controls={listId}
        aria-activedescendant={items[active] ? optionId(active) : undefined}
        aria-autocomplete="list"
        aria-label={finds ? "Search patients by name or phone, or go to a page" : "Go to a page"}
        placeholder={finds ? "Patient name or phone number…" : "Go to a page…"}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={onKeyDown}
        autoComplete="off"
        spellCheck={false}
      />
      <ul className="qs-list" id={listId} role="listbox" aria-label="Results">
        {items.map((it, i) => (
          <li
            key={it.key}
            id={optionId(i)}
            role="option"
            aria-selected={i === active}
            className={i === active ? "on" : ""}
            onMouseMove={() => setActive(i)}
            onClick={() => it.run()}
          >
            <span className="l">{it.label}</span>
            <span className="h">{it.hint}</span>
          </li>
        ))}
      </ul>
      {empty && <p className="qs-note">No patient or page matches “{q.trim()}”.</p>}
      <p className="qs-note" role="status">
        {status || "↑ ↓ to move · Enter to choose · Esc to close"}
      </p>
    </dialog>
  );
}
