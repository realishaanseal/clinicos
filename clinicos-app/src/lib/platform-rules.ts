/**
 * Checking what an operator types about a clinic. Pure functions, shared by
 * the platform routes.
 */
import { PLANS, cleanSlug } from "./tenant";
import { cleanText } from "./users";

export type ClinicInput = {
  name?: string;
  slug?: string;
  plan?: string;
  localSync?: boolean;
  domain?: string | null;
  paidUntil?: string | null;
  notes?: string | null;
  status?: "active" | "suspended";
};

/** A hostname a clinic owns, like records.sharmaclinic.in. Lowercase, no
 *  scheme, no path, no port. */
const HOST_RE = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** Reads the body of a create or change request. Returns what was given and
 *  valid, or the first problem found, in words an operator can act on. */
export function readClinicInput(body: Record<string, unknown>, creating: boolean): { input: ClinicInput } | { error: string } {
  const input: ClinicInput = {};

  if (body.name !== undefined || creating) {
    const name = cleanText(body.name);
    if (!name) return { error: "Enter the clinic's name." };
    input.name = name;
  }
  if (body.slug !== undefined || creating) {
    const slug = cleanSlug(body.slug);
    if (!slug) return { error: "The clinic ID must be 3 to 40 lowercase letters, numbers and dashes, starting with a letter." };
    input.slug = slug;
  }
  if (body.plan !== undefined || creating) {
    const plan = String(body.plan ?? "");
    if (!(plan in PLANS)) return { error: "Choose a plan." };
    input.plan = plan;
  }
  if (body.localSync !== undefined) input.localSync = body.localSync === true;
  if (body.domain !== undefined) {
    const d = String(body.domain ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (d && !HOST_RE.test(d)) return { error: "The web address should look like records.clinicname.in, with nothing before or after it." };
    input.domain = d || null;
  }
  if (body.paidUntil !== undefined) {
    const p = String(body.paidUntil ?? "").trim();
    if (p && !/^\d{4}-\d{2}-\d{2}$/.test(p)) return { error: "Paid until should be a date." };
    input.paidUntil = p || null;
  }
  if (body.notes !== undefined) input.notes = cleanText(body.notes, 1000) || null;
  if (body.status !== undefined) {
    if (body.status !== "active" && body.status !== "suspended") return { error: "A clinic is either active or paused." };
    input.status = body.status;
  }
  return { input };
}
