/**
 * Every real address the site points at, in one place, so changing one is a
 * single edit rather than a search.
 *
 * SITE_URL must match the domain the Vercel project actually serves: it is what
 * share previews, robots.txt and the sitemap resolve against. The Tally form
 * links back to `${SITE_URL}/privacy`, so if this changes, update the form too.
 */

export const SITE_URL = "https://vxclinicos.vercel.app";

export const CONTACT_EMAIL = "ishaanseal@gmail.com";

/** Tally form "Talk to ClinicOS". Responses land in the Tally account, never here. */
export const CONTACT_FORM_URL = "https://tally.so/r/QKbB8k";

/**
 * The clinic app, served on this same address under /app.
 *
 * It is a separate Vercel project (vxclinicos-app, Root Directory clinicos-app)
 * built with basePath /app. next.config.ts passes every /app request through to
 * CLINIC_APP_ORIGIN, so a visitor only ever sees vxclinicos.vercel.app and the
 * sign-in cookie belongs to it. This site still holds no patient data and has
 * no code that can reach any: it forwards requests, nothing more.
 */
export const APP_PATH = "/app";
export const CLINIC_APP_ORIGIN = "https://vxclinicos-app.vercel.app";
