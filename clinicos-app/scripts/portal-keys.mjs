#!/usr/bin/env node
/**
 * Two new keys for the patient portal, to paste into the app's environment on
 * Vercel (Settings → Environment Variables, Production, marked Sensitive):
 *
 *   npm run portal:keys
 *
 * Set them once. Changing the encryption key makes every shared prescription
 * unreadable; changing the HMAC key signs every patient out for good (they
 * start again with a printed code). Neither touches the clinics' records.
 * Printed here only, never saved anywhere by this script.
 */
import { randomBytes } from "node:crypto";

console.log(`PORTAL_ENCRYPTION_KEY=${randomBytes(32).toString("base64")}`);
console.log(`PORTAL_HMAC_KEY=${randomBytes(32).toString("base64")}`);
