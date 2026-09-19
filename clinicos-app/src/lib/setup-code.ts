/**
 * The one-time code that guards /setup online. See the setup route for why.
 * Server only.
 *
 * A clinic Varaxis creates carries its own code (only its hash is stored, and
 * it is cleared once the first account exists). The first clinic — the only
 * one on a clinic computer — uses SETUP_CODE from the environment, as before.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { FIRST_CLINIC_ID, type Tenant } from "./db";

const sha256 = (s: string) => createHash("sha256").update(s).digest();

/** Codes are compared without case, spaces or dashes, so one read aloud or
 *  copied by hand still works. */
const canonical = (s: unknown) => String(s ?? "").toUpperCase().replace(/[\s-]/g, "");

export function setupCodeRequired(clinic: Pick<Tenant, "id" | "setupCodeHash">): boolean {
  if (clinic.setupCodeHash) return true;
  return Boolean(process.env.SETUP_CODE) || process.env.DATA_BACKEND === "postgres";
}

export function setupCodeMatches(clinic: Pick<Tenant, "id" | "setupCodeHash">, given: unknown): boolean {
  if (clinic.setupCodeHash) {
    const a = sha256(canonical(given));
    const b = Buffer.from(clinic.setupCodeHash, "hex");
    return b.length === a.length && timingSafeEqual(a, b);
  }
  // Only the first clinic may fall back to the server's code. Any other clinic
  // without a code of its own has not been given one by Varaxis yet.
  if (clinic.id !== FIRST_CLINIC_ID) return false;
  const expected = process.env.SETUP_CODE;
  if (!expected) return process.env.DATA_BACKEND !== "postgres";
  const a = sha256(String(given ?? "").trim());
  const b = sha256(expected);
  return timingSafeEqual(a, b);
}

// No 0/O or 1/I/L: the code is read out over the phone and typed by hand.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** A new code for a clinic, and the hash to store. Shown once, never kept. */
export function newSetupCode(): { code: string; hash: string } {
  let raw = "";
  while (raw.length < 12) {
    for (const b of randomBytes(24)) {
      if (b >= 248) continue; // 248 = 8 × 31: every character equally likely
      raw += ALPHABET[b % ALPHABET.length];
      if (raw.length === 12) break;
    }
  }
  const code = `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
  return { code, hash: sha256(canonical(code)).toString("hex") };
}
