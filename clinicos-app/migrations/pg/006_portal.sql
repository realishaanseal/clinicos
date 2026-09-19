-- The patient portal (v0.5 Part C, 19 Sep 2026), inside the online app rather
-- than as a separate one: a doctor shares a signed visit, with the patient's
-- spoken consent, and the patient reads it on their phone.
--
-- What is kept, and how:
--   - a shared visit is exactly the signed prescription, AES-256-GCM encrypted
--     with PORTAL_ENCRYPTION_KEY (payloadEnc), on top of the database's own
--     encryption. Never the transcript, the recording, the AI draft or the edits.
--   - the patient's phone number only as an HMAC (phoneHmac), so a copy of this
--     table does not list anyone's number
--   - the code printed on the prescription only as a hash (codeHash)
--   - a PIN only as a scrypt hash
--
-- PortalShare's twin is in src/lib/sql.ts, where a clinic computer keeps these
-- rows, minus the three secret columns, to show what has been shared. The
-- patients' own tables exist only here.
--
-- Named Portal* because the earlier standalone portal's tables ("Clinic",
-- "PatientAccount", "SharedVisit", "PortalSession") are in this database too,
-- unused.

create table if not exists "PortalShare" (
  "id"         text primary key,
  "clinicId"   text not null references "Tenant" ("id"),
  "consultId"  text not null references "Consult" ("id") on delete cascade,
  "patientId"  text not null,
  "visitDate"  text not null,
  "sharedAt"   text not null,
  "sharedBy"   text,
  "consentBy"  text,
  "revokedAt"  text,
  -- The patient removed it from their own list. Only they can see that.
  "hiddenAt"   text,
  "phoneHmac"  text,
  "codeHash"   text unique,
  "payloadEnc" text,
  "updatedAt"  text,
  "syncedAt"   text,
  "syncOrigin" text
);
create index if not exists "idx_share_consult" on "PortalShare" ("clinicId", "consultId");
create index if not exists "idx_share_phone" on "PortalShare" ("phoneHmac") where "revokedAt" is null;
create index if not exists "idx_share_synced" on "PortalShare" ("clinicId", "syncedAt", "id");
drop trigger if exists "sync_PortalShare" on "PortalShare";
create trigger "sync_PortalShare" before insert or update on "PortalShare" for each row execute function clinicos_stamp_updated();

-- One account per phone number, whichever clinics shared with it.
create table if not exists "PortalAccount" (
  "id"             text primary key,
  "phoneHmac"      text not null unique,
  "pinHash"        text not null,
  "failedAttempts" integer not null default 0,
  -- Five wrong PINs lock the account for fifteen minutes.
  "lockedUntil"    text,
  "createdAt"      text not null,
  "lastLoginAt"    text
);

-- Only a SHA-256 of the cookie token, as for clinic accounts.
create table if not exists "PortalLogin" (
  "tokenHash"  text primary key,
  "accountId"  text not null references "PortalAccount" ("id") on delete cascade,
  "createdAt"  text not null,
  "expiresAt"  text not null,
  "lastSeenAt" text not null
);
create index if not exists "idx_portallogin_account" on "PortalLogin" ("accountId");

-- Wrong codes and PINs by phone, for slowing a guesser down before any account
-- exists to lock. Kept for a day; nothing about which clinic or visit.
create table if not exists "PortalAttempt" (
  "phoneHmac" text not null,
  "at"        text not null
);
create index if not exists "idx_portalattempt" on "PortalAttempt" ("phoneHmac", "at");
