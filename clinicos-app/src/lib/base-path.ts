/**
 * Online, the app is served from vxclinicos.vercel.app/app: the website owns
 * the address and passes everything under /app through to this app, which is
 * built with NEXT_PUBLIC_BASE_PATH=/app. On the clinic computer it is empty and
 * the app lives at the root, as it always has.
 *
 * Next.js adds the prefix to <Link>, redirect() and router.push by itself. It
 * cannot see paths written by hand — fetch("/api/…"), <a href>, and
 * window.location — so those go through appPath().
 *
 * No Node imports; client components use this.
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

export function appPath(path: string): string {
  return `${BASE_PATH}${path}`;
}
