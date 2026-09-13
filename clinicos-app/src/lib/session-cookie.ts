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

/** Reachable without signing in. Everything else needs a session. */
export const PUBLIC_PATHS = ["/login", "/setup", "/api/auth/login", "/api/setup"];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
