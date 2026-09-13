/**
 * Account rules shared by the setup and admin routes and the admin screen.
 * Pure functions only: this file is imported by client components too.
 */

export type Role = "doctor" | "staff" | "admin";

export const ROLES: Role[] = ["doctor", "staff", "admin"];

export const ROLE_LABEL: Record<Role, string> = {
  doctor: "Doctor",
  staff: "Front desk",
  admin: "Clinic admin",
};

export const ROLE_HELP: Record<Role, string> = {
  doctor: "Consultations, notes and prescriptions.",
  staff: "Registers patients and runs the day's list. Cannot open clinical notes.",
  admin: "Manages people, clinic details and backups. Cannot open clinical notes.",
};

export function describeAccess(role: Role, isAdmin: boolean): string {
  if (role === "doctor" && isAdmin) return "Doctor · manages the clinic";
  return ROLE_LABEL[role];
}

export const USERNAME_RULE = "3 to 32 letters, numbers, dots, dashes or underscores";
const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;

export function cleanUsername(v: unknown): string | null {
  const u = String(v ?? "").trim().toLowerCase();
  return USERNAME_RE.test(u) ? u : null;
}

export function cleanText(v: unknown, max = 120): string {
  return String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

export function parseRole(v: unknown): Role | null {
  return ROLES.includes(v as Role) ? (v as Role) : null;
}

export const PASSWORD_MIN = 8;

/** Returns what is wrong with a new password, or null if it is acceptable.
 *  Length is the rule that matters; composition rules mostly produce
 *  "Password1!" and a sticky note on the monitor. */
export function passwordProblem(pw: string): string | null {
  if (pw.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (pw.length > 200) return "That password is too long.";
  return null;
}
