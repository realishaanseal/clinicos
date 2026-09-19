/**
 * Which clinic a request is for, before anyone has signed in, and what each
 * clinic's purchase switched on.
 *
 * Once someone is signed in, their clinic comes from their session and nothing
 * here is consulted. Before that — on the sign-in and setup pages — the clinic
 * is found, in order, from:
 *   1. its address, /c/<slug>, or ?clinic=<slug> on /login and /setup
 *   2. the clinic remembered in this browser from the last sign-in
 *   3. the clinic's own web address, if Varaxis gave it one (Tenant.domain)
 *   4. the only clinic there is — always the case on a clinic computer, and
 *      the case online until a second clinic is created
 * None of this is a security boundary: a password is still needed, and it
 * only matches an account in the clinic that was found.
 *
 * Server only.
 */
import { cookies, headers } from "next/headers";
import { BACKEND } from "./sql";
import {
  FIRST_CLINIC_ID,
  countTenants,
  getTenant,
  getTenantByDomain,
  getTenantBySlug,
  listTenants,
  type Tenant,
} from "./db";

export { CLINIC_COOKIE } from "./session-cookie";
import { CLINIC_COOKIE } from "./session-cookie";

/** Many clinics share this copy of ClinicOS. Only online; a clinic computer
 *  holds exactly one clinic, whatever its database says. */
export const MULTI_CLINIC = BACKEND === "postgres";

export async function resolveClinic(slug?: string | null): Promise<Tenant | null> {
  if (slug) return (await getTenantBySlug(slug)) ?? null;
  if (!MULTI_CLINIC) return (await getTenant(FIRST_CLINIC_ID)) ?? null;

  const remembered = (await cookies()).get(CLINIC_COOKIE)?.value;
  if (remembered) {
    const t = await getTenantBySlug(remembered);
    if (t) return t;
  }
  const host = (await headers()).get("x-forwarded-host") || (await headers()).get("host");
  if (host) {
    const t = await getTenantByDomain(host.split(":")[0]);
    if (t) return t;
  }
  if ((await countTenants()) === 1) return (await listTenants())[0];
  return null;
}

// ------------------------------------------------------------------ plans
/**
 * What a clinic bought. The plan is the name on the invoice; the features are
 * what it switches on, set by Varaxis when the clinic buys and changeable
 * later. Prices live in Varaxis's own paperwork, not here.
 */
export const PLANS: Record<string, string> = {
  trial: "Trial",
  cloud: "Cloud",
  "cloud-local": "Cloud + clinic computer",
};

export type Features = {
  /** A ClinicOS install on the clinic's own computer may keep its records in
   *  step with this online copy. Sold separately. */
  localSync: boolean;
};

export function parseFeatures(json: string | null | undefined): Features {
  let raw: Partial<Features> = {};
  try {
    raw = JSON.parse(json || "{}") ?? {};
  } catch {
    /* treat as none */
  }
  return { localSync: raw.localSync === true };
}

/** The address a clinic's people bookmark. */
export function clinicPath(slug: string): string {
  return `/c/${slug}`;
}

/** 3 to 40 lowercase letters, digits and single dashes, starting with a letter:
 *  readable aloud, safe in an address, and never mistaken for a page name. */
export const SLUG_RULE = "3 to 40 lowercase letters, numbers and dashes, starting with a letter";
const SLUG_RE = /^[a-z](?:[a-z0-9]|-(?=[a-z0-9])){2,39}$/;
const RESERVED = new Set(["app", "api", "admin", "platform", "login", "setup", "sync", "portal", "static", "www"]);

export function cleanSlug(v: unknown): string | null {
  const s = String(v ?? "").trim().toLowerCase();
  return SLUG_RE.test(s) && !RESERVED.has(s) ? s : null;
}
