/**
 * The portal's secrets. Server only; online only.
 *
 *   PORTAL_ENCRYPTION_KEY  32 random bytes, base64. Encrypts each shared
 *                          prescription (AES-256-GCM), on top of the
 *                          database's own encryption at rest.
 *   PORTAL_HMAC_KEY        32 random bytes, base64. Turns a phone number into
 *                          an HMAC, so the database never lists anyone's number.
 *
 * Make both with `npm run portal:keys` and put them in the app's environment on
 * Vercel. Losing the encryption key makes every shared visit unreadable (the
 * clinic's own records are untouched: they are not encrypted with it); losing
 * the HMAC key means patients sign in afresh with a printed code. Changing
 * either has the same effect, so set them once.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

function key(name: string): Buffer | null {
  const v = process.env[name];
  if (!v) return null;
  const b = Buffer.from(v, "base64");
  return b.length === 32 ? b : null;
}

/** Sharing with patients needs both keys set, correctly. Without them the
 *  Share button explains what is missing instead of failing. */
export function portalReady(): boolean {
  return !!key("PORTAL_ENCRYPTION_KEY") && !!key("PORTAL_HMAC_KEY");
}

export const PORTAL_NOT_READY =
  "Sharing with patients is not switched on for this ClinicOS yet: it needs its two portal keys set on the server.";

/** The last ten digits, whatever was typed around them: +91, spaces, dashes. */
export function normalisePhone(v: unknown): string | null {
  const digits = String(v ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
}

export function phoneHmac(phone: string): string {
  const k = key("PORTAL_HMAC_KEY");
  if (!k) throw new Error(PORTAL_NOT_READY);
  return createHmac("sha256", k).update(phone).digest("hex");
}

// No 0/O, 1/I/L: read aloud, copied by hand from a prescription.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** A 10-character code, grouped for reading aloud: K7QF-2MXP-9D. */
export function newShareCode(): string {
  let raw = "";
  while (raw.length < 10) {
    for (const b of randomBytes(20)) {
      if (b >= 248) continue; // 248 = 8 × 31: every character equally likely
      raw += ALPHABET[b % ALPHABET.length];
      if (raw.length === 10) break;
    }
  }
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
}

const canonicalCode = (v: unknown) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

export function codeHash(code: unknown): string {
  return createHash("sha256").update(canonicalCode(code)).digest("hex");
}

export function looksLikeCode(v: unknown): boolean {
  return canonicalCode(v).length === 10;
}

/** v1:<iv>.<tag>.<ciphertext>, each base64. */
export function encrypt(value: unknown): string {
  const k = key("PORTAL_ENCRYPTION_KEY");
  if (!k) throw new Error(PORTAL_NOT_READY);
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k, iv);
  const body = Buffer.concat([c.update(JSON.stringify(value), "utf8"), c.final()]);
  return `v1:${iv.toString("base64")}.${c.getAuthTag().toString("base64")}.${body.toString("base64")}`;
}

export function decrypt<T>(text: string): T {
  const k = key("PORTAL_ENCRYPTION_KEY");
  if (!k) throw new Error(PORTAL_NOT_READY);
  const m = /^v1:([^.]+)\.([^.]+)\.(.+)$/.exec(text);
  if (!m) throw new Error("This shared visit cannot be read.");
  const d = createDecipheriv("aes-256-gcm", k, Buffer.from(m[1], "base64"));
  d.setAuthTag(Buffer.from(m[2], "base64"));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(m[3], "base64")), d.final()]).toString("utf8")) as T;
}

export function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
}
