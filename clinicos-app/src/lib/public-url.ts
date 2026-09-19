/**
 * The address people actually type to reach this app, for showing on screen:
 * https://vxclinicos.vercel.app/app online (through the website), or
 * http://localhost:3000 on a clinic computer. Server only.
 */
import { headers } from "next/headers";
import { BASE_PATH } from "./base-path";

export async function publicAppUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto") || (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}${BASE_PATH}`;
}
