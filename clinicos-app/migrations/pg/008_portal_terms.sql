-- The patient accepts the portal's terms themselves, once, in their own
-- language, the first time they sign in (20 Sep 2026). This replaced the
-- doctor reading a consent out before every share. See src/lib/terms.ts.
--
-- Additive: the version already running neither reads nor writes these.

alter table "PortalAccount" add column if not exists "termsAcceptedAt" text;
alter table "PortalAccount" add column if not exists "termsVersion" text;
-- en, bn or hi: the language the patient chose for the portal.
alter table "PortalAccount" add column if not exists "language" text;
