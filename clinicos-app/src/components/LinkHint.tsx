"use client";

import { useLinkStatus } from "next/link";

/**
 * A tap that has been heard.
 *
 * Every clinic screen is rendered on the server with the day's real numbers
 * in it, so a tap on a link leaves the previous page on screen until the
 * database answers. On a clinic's connection that reads as a dead tap, and the
 * next thing a doctor does is tap again.
 *
 * Next.js can show a skeleton for that wait (loading.tsx), but a loading file
 * makes the response start streaming before the page has looked anything up —
 * which means a page that turns out not to exist can no longer answer 404.
 * So the screens that can say "not found" — a patient, a visit, a bill — get
 * this instead: a small spinner inside the link itself, from the moment it is
 * clicked until the new screen arrives.
 *
 * It is always in the layout and only changes opacity, so nothing on the page
 * moves when it appears.
 */
export default function LinkHint() {
  const { pending } = useLinkStatus();
  return <span className={`link-hint${pending ? " on" : ""}`} aria-hidden="true" />;
}
