import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, SESSION_SECONDS, isPublicPath } from "@/lib/session-cookie";

/**
 * First gate only. This runs on the Edge runtime, where better-sqlite3 cannot
 * load, so it checks that a session cookie exists and nothing more. Whether
 * that session is real, live and allowed to do the thing is decided by
 * requireUser() / requireApiUser() in the page or route itself.
 */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value;

  if (!token && !isPublicPath(pathname)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
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
