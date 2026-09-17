"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IcAlert, IcCheck, IcPlus } from "./Icons";
import { describeAccess, ROLE_HELP, ROLE_LABEL, ROLES, USERNAME_RULE, type Role } from "@/lib/users";
import { appPath } from "@/lib/base-path";
import { fmtDate, fmtTime } from "@/lib/time";

export type AdminUserRow = {
  id: string;
  name: string;
  username: string;
  role: Role;
  isAdmin: boolean;
  qualification: string | null;
  regNo: string | null;
  active: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
};

type Draft = { name: string; username: string; role: Role; isAdmin: boolean; qualification: string; regNo: string };
const EMPTY: Draft = { name: "", username: "", role: "doctor", isAdmin: false, qualification: "", regNo: "" };

/**
 * One "Manage" button per row. Editing, resetting a password and deactivating
 * all live in that one dialog: three buttons per row stacked into a column and
 * crushed the table, and they put a destructive button a slip away from Edit.
 */
export default function UsersAdmin({ users, currentUserId }: { users: AdminUserRow[]; currentUserId: string }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [managing, setManaging] = useState<AdminUserRow | null>(null);
  const [edit, setEdit] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [secret, setSecret] = useState<{ name: string; password: string; created: boolean } | null>(null);

  async function call(url: string, method: string, body?: unknown) {
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
    const data = await call(appPath("/api/admin/users"), "POST", draft);
    if (!data) return;
    setSecret({ name: data.user.name, password: data.tempPassword, created: true });
    setDraft(EMPTY);
    setAdding(false);
    router.refresh();
  }

  function openManage(u: AdminUserRow) {
    setError("");
    setSecret(null);
    setManaging(u);
    setEdit({
      name: u.name,
      username: u.username,
      role: u.role,
      isAdmin: u.isAdmin,
      qualification: u.qualification ?? "",
      regNo: u.regNo ?? "",
    });
  }

  async function saveDetails() {
    if (!managing) return;
    const data = await call(appPath(`/api/admin/users/${managing.id}`), "PATCH", {
      name: edit.name,
      role: edit.role,
      isAdmin: edit.isAdmin,
      qualification: edit.qualification,
      regNo: edit.regNo,
    });
    if (!data) return;
    setManaging(null);
    router.refresh();
  }

  async function resetPassword() {
    if (!managing) return;
    const data = await call(appPath(`/api/admin/users/${managing.id}/reset`), "POST");
    if (!data) return;
    setSecret({ name: managing.name, password: data.tempPassword, created: false });
    setManaging(null);
    router.refresh();
  }

  async function setActive(active: boolean) {
    if (!managing) return;
    if (!(await call(appPath(`/api/admin/users/${managing.id}`), "PATCH", { active }))) return;
    setManaging(null);
    router.refresh();
  }

  const self = managing?.id === currentUserId;

  return (
    <>
      {secret && (
        <div className="note ok" role="status">
          <IcCheck size={17} />
          <span>
            {secret.created ? `Account created for ${secret.name}.` : `Password reset for ${secret.name}.`}{" "}
            Their temporary password is <span className="secret">{secret.password}</span>
            <br />
            Give it to them in person. It is shown only this once, and ClinicOS asks them to choose their own
            password the first time they sign in.{" "}
            <button type="button" className="quiet small" onClick={() => setSecret(null)}>
              Done
            </button>
          </span>
        </div>
      )}

      {error && !managing && (
        <div className="note err" role="alert">
          <IcAlert size={16} />
          <span>{error}</span>
        </div>
      )}

      {!adding ? (
        <div style={{ marginBottom: 18 }}>
          <button type="button" onClick={() => { setAdding(true); setSecret(null); setError(""); }}>
            <IcPlus size={16} /> Add a person
          </button>
        </div>
      ) : (
        <div className="card flush">
          <div className="card-head">
            <span className="title">Add a person</span>
            <button type="button" className="quiet small" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
          <form onSubmit={add} className="card-body">
            <div className="grid">
              <div className="field">
                <label htmlFor="nu-name">Full name</label>
                <input
                  id="nu-name"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  required
                  autoFocus
                />
              </div>
              <div className="field">
                <label htmlFor="nu-username">Username</label>
                <input
                  id="nu-username"
                  value={draft.username}
                  onChange={(e) => setDraft({ ...draft, username: e.target.value })}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  aria-describedby="nu-username-hint"
                />
                <p className="hint" id="nu-username-hint">{USERNAME_RULE[0].toUpperCase() + USERNAME_RULE.slice(1)}.</p>
              </div>
            </div>
            <RoleFields idPrefix="nu" value={draft} onChange={setDraft} />
            <div className="btnrow">
              <button type="submit" disabled={busy}>
                {busy ? "Adding…" : "Add and create a temporary password"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card flush" style={{ overflowX: "auto" }}>
        <table className="people">
          <thead>
            <tr>
              <th>Person</th>
              <th>Access</th>
              <th>Status</th>
              <th>Last sign-in</th>
              <th><span className="visually-hidden">Manage</span></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <span className="nm">
                    {u.name}
                    {u.id === currentUserId && <span className="dim"> · you</span>}
                  </span>
                  <div className="dim sub">
                    <span className="mono">{u.username}</span>
                    {u.qualification && ` · ${u.qualification}`}
                  </div>
                </td>
                <td>{describeAccess(u.role, u.isAdmin)}</td>
                <td>
                  {!u.active ? (
                    <span className="pill off">Deactivated</span>
                  ) : u.mustChangePassword ? (
                    <span className="pill draft">Temporary password</span>
                  ) : (
                    <span className="pill signed">Active</span>
                  )}
                </td>
                <td className="dim">
                  {u.lastLoginAt ? (
                    <>
                      <span className="nowrap">
                        {fmtDate(new Date(u.lastLoginAt), { day: "numeric", month: "short" })}
                      </span>
                      <div className="sub nowrap">
                        {fmtTime(new Date(u.lastLoginAt), { hour: "numeric", minute: "2-digit" })}
                      </div>
                    </>
                  ) : (
                    "Never"
                  )}
                </td>
                <td style={{ textAlign: "right" }}>
                  <button type="button" className="ghost small" onClick={() => openManage(u)} disabled={busy}>
                    Manage<span className="visually-hidden"> {u.name}</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="muted">
        Deactivating signs a person out everywhere and stops them signing in. Their name stays on everything
        they signed, and you can reactivate them later.
      </p>

      {managing && (
        <div className="modal-back" onClick={() => !busy && setManaging(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="manage-person-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-hd neutral" id="manage-person-title">
              {managing.name}
            </div>
            <div className="modal-bd">
              <div className="field">
                <label htmlFor="ed-name">Full name</label>
                <input id="ed-name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
              </div>
              <p className="muted" style={{ marginTop: -4 }}>
                Username <span className="mono">{managing.username}</span> cannot be changed.
              </p>
              <RoleFields idPrefix="ed" value={edit} onChange={setEdit} lockAccess={self} />
              {self && <p className="hint">You can&apos;t change your own access. Ask another admin to do it.</p>}

              {!self && (
                <div className="manage-more">
                  <div>
                    <strong>Password</strong>
                    <span className="muted">Replace it with a temporary one and sign them out everywhere.</span>
                  </div>
                  <button type="button" className="ghost small" onClick={resetPassword} disabled={busy}>
                    Reset password
                  </button>
                </div>
              )}
              {!self && (
                <div className="manage-more">
                  <div>
                    <strong>{managing.active ? "Deactivate" : "Reactivate"}</strong>
                    <span className="muted">
                      {managing.active
                        ? "Signs them out straight away and stops them signing in until reactivated."
                        : "Lets them sign in again with the password they had."}
                    </span>
                  </div>
                  {managing.active ? (
                    <button type="button" className="ghost small danger-btn" onClick={() => setActive(false)} disabled={busy}>
                      Deactivate
                    </button>
                  ) : (
                    <button type="button" className="ghost small" onClick={() => setActive(true)} disabled={busy}>
                      Reactivate
                    </button>
                  )}
                </div>
              )}

              {error && (
                <div className="note err" role="alert">
                  <IcAlert size={16} />
                  <span>{error}</span>
                </div>
              )}
            </div>
            <div className="modal-ft">
              <button type="button" className="ghost" onClick={() => setManaging(null)} disabled={busy}>
                Close
              </button>
              <button type="button" onClick={saveDetails} disabled={busy || !edit.name.trim()}>
                {busy ? "Saving…" : "Save details"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function RoleFields({
  idPrefix,
  value,
  onChange,
  lockAccess = false,
}: {
  idPrefix: string;
  value: Draft;
  onChange: (d: Draft) => void;
  lockAccess?: boolean;
}) {
  const set = (patch: Partial<Draft>) => onChange({ ...value, ...patch });

  return (
    <>
      <fieldset className="choice" disabled={lockAccess}>
        <legend>What do they do here?</legend>
        {ROLES.map((r) => (
          <label key={r}>
            <input
              type="radio"
              name={`${idPrefix}-role`}
              checked={value.role === r}
              onChange={() => set({ role: r })}
            />
            <span>
              {ROLE_LABEL[r]}
              <small>{ROLE_HELP[r]}</small>
            </span>
          </label>
        ))}
      </fieldset>

      {value.role === "doctor" && (
        <>
          <label className="check">
            <input
              type="checkbox"
              checked={value.isAdmin}
              disabled={lockAccess}
              onChange={(e) => set({ isAdmin: e.target.checked })}
            />
            Can also manage the clinic: people, clinic details and backups
          </label>
          <div className="grid">
            <div className="field">
              <label htmlFor={`${idPrefix}-qual`}>Qualification</label>
              <input
                id={`${idPrefix}-qual`}
                value={value.qualification}
                onChange={(e) => set({ qualification: e.target.value })}
                placeholder="MBBS"
              />
            </div>
            <div className="field">
              <label htmlFor={`${idPrefix}-reg`}>Registration number</label>
              <input id={`${idPrefix}-reg`} value={value.regNo} onChange={(e) => set({ regNo: e.target.value })} />
            </div>
          </div>
          <p className="hint" style={{ marginTop: -6, marginBottom: 14 }}>
            These print on every prescription this doctor signs.
          </p>
        </>
      )}
    </>
  );
}
