"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IcAlert, IcCheck, IcPlus } from "./Icons";
import { fmt } from "@/lib/time";

export type DeviceRow = {
  id: string;
  name: string;
  createdAt: string;
  createdBy: string | null;
  lastSeenAt: string | null;
  clockOffset: number | null;
  revokedAt: string | null;
};

/**
 * Online: the clinic computers that keep in step with this clinic. Making one
 * gives a key, shown once, to paste into ClinicOS on that computer. Used in
 * Clinic admin and, for Varaxis, on the clinic's page in the platform console.
 * The endpoint is passed in already prefixed with appPath(): a POST to it makes
 * a key, a DELETE to it plus "/<id>" switches that computer off.
 */
export default function DevicesPanel({
  devices,
  endpoint,
  address,
}: {
  devices: DeviceRow[];
  endpoint: string;
  address: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [made, setMade] = useState<{ name: string; key: string } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  async function send(url: string, method: string, body?: unknown) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "That didn't work. Try again.");
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const data = await send(endpoint, "POST", { name });
    if (!data) return;
    setMade({ name: data.device.name, key: data.key });
    setName("");
    setAdding(false);
    router.refresh();
  }

  async function revoke(id: string) {
    if (await send(`${endpoint}/${id}`, "DELETE")) {
      setConfirming(null);
      router.refresh();
    }
  }

  const live = devices.filter((d) => !d.revokedAt);

  return (
    <div className="card flush">
      <div className="card-head">
        <span className="title">Clinic computers</span>
        <span className="muted">kept in step with this clinic</span>
      </div>
      <div className="card-body">
        {made && (
          <div className="note ok" role="status">
            <IcCheck size={17} />
            <span>
              Key for <strong>{made.name}</strong>: <span className="secret" style={{ wordBreak: "break-all" }}>{made.key}</span>
              <br />
              On that computer, open ClinicOS → Clinic admin → ClinicOS online, and paste this key with the address{" "}
              <span className="mono">{address}</span>. It is shown only this once. Anyone with it can open this
              clinic&apos;s records, so pass it on in person.{" "}
              <button type="button" className="quiet small" onClick={() => setMade(null)}>
                Done
              </button>
            </span>
          </div>
        )}
        {error && (
          <div className="note err" role="alert">
            <IcAlert size={16} />
            <span>{error}</span>
          </div>
        )}

        {live.length === 0 ? (
          <p className="muted" style={{ marginTop: 0 }}>
            No clinic computer is connected. ClinicOS on the clinic&apos;s own computer can keep a full copy of these
            records, and keep working when the internet is down.
          </p>
        ) : (
          <table style={{ marginBottom: 14 }}>
            <thead>
              <tr>
                <th>Computer</th>
                <th>Last in step</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {live.map((d) => (
                <tr key={d.id}>
                  <td>
                    <strong>{d.name}</strong>
                    <div className="dim" style={{ fontSize: 12.5 }}>
                      connected {fmt(d.createdAt, { day: "numeric", month: "short", year: "numeric" })}
                      {d.createdBy ? ` by ${d.createdBy}` : ""}
                    </div>
                  </td>
                  <td className="dim">
                    {d.lastSeenAt ? fmt(d.lastSeenAt, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "not yet"}
                    {d.clockOffset !== null && Math.abs(d.clockOffset) > 300 && (
                      <div style={{ color: "var(--amber-600)", fontSize: 12.5 }}>its clock is {Math.round(Math.abs(d.clockOffset) / 60)} min off</div>
                    )}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {confirming === d.id ? (
                      <span className="btnrow" style={{ justifyContent: "flex-end" }}>
                        <button type="button" className="ghost danger-btn small" onClick={() => revoke(d.id)} disabled={busy}>
                          Switch off
                        </button>
                        <button type="button" className="quiet small" onClick={() => setConfirming(null)} disabled={busy}>
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button type="button" className="ghost small" onClick={() => setConfirming(d.id)} disabled={busy}>
                        Switch off…
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {adding ? (
          <form onSubmit={add} className="btnrow">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name it, like “Reception laptop”"
              aria-label="Name of the computer"
              style={{ flex: "1 1 240px", width: "auto" }}
              autoFocus
              required
            />
            <button type="submit" disabled={busy}>
              {busy ? "Making…" : "Make a key"}
            </button>
            <button type="button" className="quiet" onClick={() => setAdding(false)} disabled={busy}>
              Cancel
            </button>
          </form>
        ) : (
          <button type="button" className="ghost" onClick={() => { setAdding(true); setMade(null); }}>
            <IcPlus size={16} /> Connect a clinic computer
          </button>
        )}
      </div>
    </div>
  );
}
