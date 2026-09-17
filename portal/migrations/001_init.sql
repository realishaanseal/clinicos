-- ClinicOS portal — initial schema.
--
-- The portal holds only what a doctor has explicitly shared with a patient who
-- consented: the signed prescription, encrypted, plus the little needed to let
-- that patient sign in and read it back. It never holds a transcript, audio,
-- the AI draft or the edit log, and it is never the clinic's record — the full
-- record stays on the clinic computer and is pushed one way, never pulled.
--
-- Identifiers are quoted so Postgres keeps the capitals. Postgres folds an
-- unquoted name to lowercase, and the clinic app's SQLite schema already calls
-- these PatientAccount and phoneHmac; one vocabulary across both databases is
-- worth the quotes. Dropping a pair of quotes breaks the query loudly rather
-- than quietly, which is the behaviour we want.

create table if not exists "Clinic" (
  "id"        text        primary key,
  "name"      text        not null,
  -- SHA-256 of the clinic key. The key itself is printed once at onboarding
  -- and pasted into the clinic app, so a leak of this table cannot be replayed
  -- to push shares.
  "keyHash"   text        not null unique,
  "createdAt" timestamptz not null default now()
);

create table if not exists "PatientAccount" (
  "id"             text        primary key,
  "clinicId"       text        not null references "Clinic"("id") on delete cascade,
  "phoneHmac"      text        not null,
  "displayName"    text,
  "pinHash"        text        not null,
  "failedAttempts" integer     not null default 0,
  -- Five wrong PINs lock the account for fifteen minutes.
  "lockedUntil"    timestamptz,
  "createdAt"      timestamptz not null default now(),
  unique ("clinicId", "phoneHmac")
);

create table if not exists "SharedVisit" (
  "id"         text        primary key,
  "clinicId"   text        not null references "Clinic"("id") on delete cascade,
  -- Null until the patient first signs in: the doctor shares a visit to a
  -- phone number, and the account is created later from the printed code.
  "accountId"  text        references "PatientAccount"("id") on delete set null,
  "phoneHmac"  text        not null,
  -- SHA-256 of the printed access code. The code itself exists only on paper.
  "codeHash"   text        not null unique,
  -- The signed prescription, AES-256-GCM encrypted with the server key.
  "payloadEnc" bytea       not null,
  "visitDate"  date        not null,
  "sharedAt"   timestamptz not null default now(),
  -- Set when the doctor revokes the share. A revoked visit must be gone even
  -- to someone holding the direct URL, so every read filters on this.
  "revokedAt"  timestamptz
);

create index if not exists "idx_sharedvisit_phone"   on "SharedVisit" ("clinicId", "phoneHmac");
create index if not exists "idx_sharedvisit_account" on "SharedVisit" ("accountId");

create table if not exists "PortalSession" (
  "id"         text        primary key,
  "accountId"  text        not null references "PatientAccount"("id") on delete cascade,
  -- Only the SHA-256 of the session token, exactly as the clinic app does it:
  -- a leaked database must not hand anyone a working session.
  "tokenHash"  text        not null unique,
  "createdAt"  timestamptz not null default now(),
  "lastSeenAt" timestamptz not null default now(),
  "expiresAt"  timestamptz not null
);

create index if not exists "idx_portalsession_account" on "PortalSession" ("accountId");
