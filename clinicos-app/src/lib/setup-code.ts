/**
 * The one-time code that guards /setup online. See the setup route for why.
 * Server only.
 */
import { createHash, timingSafeEqual } from "node:crypto";

export function setupCodeRequired(): boolean {
  return Boolean(process.env.SETUP_CODE) || process.env.DATA_BACKEND === "postgres";
}

export function setupCodeMatches(given: unknown): boolean {
  const expected = process.env.SETUP_CODE;
  if (!expected) return process.env.DATA_BACKEND !== "postgres";
  const a = createHash("sha256").update(String(given ?? "").trim()).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

