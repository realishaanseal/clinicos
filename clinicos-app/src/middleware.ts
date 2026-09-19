import { NextResponse, type NextRequest } from "next/server";
import {
  OPERATOR_COOKIE,
  SESSION_COOKIE,
  SESSION_SECONDS,
  isPlatformPath,
  isPublicPath,
  isSyncPath,
} from "@/lib/session-cookie";
import { BASE_PATH } from "@/lib/base-path";

/**
 * First gate only. This runs on the Edge runtime, where better-sqlite3 cannot
 * load, so it checks that a session cookie exists and nothing more. Whether
 * that session is real, live and allowed to do the thing is decided by
 * requireUser() / requireApiUser() in the page or route itself.
 */
/**
 * The address the visitor is actually on. Online, requests reach this app
 * through the website (vxclinicos.vercel.app/app), so the request's own host is
 * this app's project address, where the visitor has no session cookie. Vercel
 * sets x-forwarded-host to the address the visitor used, and overwrites any
 * value a client sends. Next.js insists middleware redirects are absolute, so
 * the redirect has to be built on this.
 */
function publicOrigin(req: NextRequest): string {
  const host = req.headers.get("x-forwarded-host") || req.nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(/:$/, "");
  return `${proto}://${host}`;
}

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // A clinic computer's sync requests carry their own key; the route checks it.
  if (isSyncPath(pathname)) return NextResponse.next();

  // Varaxis's console has its own sign-in, and a clinic's cookie opens none of it.
  if (isPlatformPath(pathname)) {
    const open = pathname === "/platform/login" || pathname === "/api/platform/login";
    if (!open && !req.cookies.get(OPERATOR_COOKIE)?.value) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
      }
      return NextResponse.redirect(new URL(`${BASE_PATH}/platform/login`, publicOrigin(req)));
    }
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;

  if (!token && !isPublicPath(pathname)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    }
    const next = pathname !== "/" ? `?next=${encodeURIComponent(pathname + search)}` : "";
    return NextResponse.redirect(new URL(`${BASE_PATH}/login${next}`, publicOrigin(req)));
  }

  const res = NextResponse.next();

  // Keep the cookie's lifetime sliding in step with the session's, so someone
  // working all day is never signed out mid-consultation. Skipped on the auth
  // routes, which set or clear the cookie themselves and must have the last word.
  if (token && !pathname.startsWith("/api/auth/") && !isPublicPath(pathname)) {
    res.cookies.set({
      name: SESSION_COOKIE,
      value: token,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_SECONDS,
      secure: req.nextUrl.protocol === "https:",
    });
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
