/**
 * Shared by middleware.ts (Edge runtime) and auth.ts (Node). Nothing in this
 * file may import a Node module, or the middleware bundle breaks.
 */

export const SESSION_COOKIE = "clinicos_session";

/**
 * Idle limit, not a hard limit. Every request pushes it back, so a session only
 * ends after 12 hours without use and never in the middle of a consultation:
 * a recording that 401s halfway loses audio, and "0 consultations lost" is the
 * one threshold that cannot slip.
 */
export const SESSION_SECONDS = 12 * 60 * 60;

/** The clinic this browser last signed in to, by its address (slug). Not a
 *  secret and not a credential: it only saves typing the clinic again. */
export const CLINIC_COOKIE = "clinicos_clinic";

/** Varaxis's own sign-in for the platform console, separate from every
 *  clinic's so that no clinic account can reach it. */
export const OPERATOR_COOKIE = "clinicos_operator";

/** Reachable without signing in. Everything else needs a session. The
 *  platform console, the sync endpoints and the patient portal (/p) check
 *  their own credentials. */
export const PUBLIC_PATHS = [
  "/login", "/setup", "/c", "/api/auth/login", "/api/setup", "/p", "/api/portal",
  // Says only that ClinicOS is up and its database answers: no record, no
  // count, nothing about any clinic. Something has to be able to ask that
  // without a password.
  "/api/health",
];

/** The platform console: its own cookie, checked by its own pages. */
export function isPlatformPath(pathname: string): boolean {
  return pathname === "/platform" || pathname.startsWith("/platform/") || pathname.startsWith("/api/platform/");
}

/** A clinic computer keeping in step with the online copy. It proves itself
 *  with its device key on every request, not with a cookie. */
export function isSyncPath(pathname: string): boolean {
  return pathname.startsWith("/api/sync/");
}

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
