-- ClinicOS clinic app — the online copy's schema.
--
-- The same tables and columns as the SQLite database on the clinic computer
-- (src/lib/sql.ts), so every query in src/lib/db.ts runs on both. Deliberately
-- kept in the same shapes rather than Postgres-native ones:
--   - timestamps are ISO-8601 text, compared as strings, exactly as in SQLite
--   - flags are 0/1 integers
-- Identifiers are quoted so Postgres keeps the capitals the app reads rows by.
--
-- These live in the same Supabase project as the patient portal's four tables
-- (Clinic, PatientAccount, SharedVisit, PortalSession). No names collide.

create table if not exists "Patient" (
  "id"           text primary key,
  "name"         text not null,
  "age"          integer,
  "sex"          text,
  "phone"        text,
  "guardianName" text,
  "createdAt"    text not null
);
create index if not exists "idx_patient_name" on "Patient" ("name");

create table if not exists "Consult" (
  "id"                 text primary key,
  "patientId"          text not null references "Patient" ("id") on delete cascade,
  "consentGiven"       integer not null default 0,
  "consentAt"          text,
  "consentBy"          text,
  "audioPath"          text,
  "audioBytes"         integer,
  "audioSeconds"       double precision,
  "audioDeletedAt"     text,
  "transcript"         text,
  "asrModel"           text,
  "asrSeconds"         double precision,
  "draftJson"          text,
  "finalJson"          text,
  "llmModel"           text,
  "llmSeconds"         double precision,
  "signedAt"           text,
  "createdAt"          text not null,
  "workingJson"        text,
  "workingSavedAt"     text,
  "recordingStartedAt" text,
  "recordingEndedAt"   text,
  "createdBy"          text,
  "doctorId"           text
);
create index if not exists "idx_consult_patient" on "Consult" ("patientId");
create index if not exists "idx_consult_created" on "Consult" ("createdAt");

-- Every correction the doctor makes to the AI draft: the accuracy metric.
create table if not exists "Edit" (
  "id"        text primary key,
  "consultId" text not null references "Consult" ("id") on delete cascade,
  "field"     text not null,
  "before"    text not null,
  "after"     text not null,
  "createdAt" text not null
);
create index if not exists "idx_edit_consult" on "Edit" ("consultId");

create table if not exists "User" (
  "id"                 text primary key,
  "name"               text not null,
  "username"           text not null,
  "role"               text not null check ("role" in ('doctor', 'staff', 'admin')),
  "isAdmin"            integer not null default 0,
  "passwordHash"       text not null,
  "qualification"      text,
  "regNo"              text,
  "active"             integer not null default 1,
  "mustChangePassword" integer not null default 0,
  "createdAt"          text not null,
  "lastLoginAt"        text
);
-- SQLite's column is UNIQUE COLLATE NOCASE; this is the same promise.
create unique index if not exists "idx_user_username" on "User" (lower("username"));

-- Only a SHA-256 of the cookie token is stored.
create table if not exists "Session" (
  "tokenHash"  text primary key,
  "userId"     text not null references "User" ("id") on delete cascade,
  "createdAt"  text not null,
  "expiresAt"  text not null,
  "lastSeenAt" text not null
);
create index if not exists "idx_session_user" on "Session" ("userId");

-- Insert-only. Never a patient's name in detail.
create table if not exists "AuditEvent" (
  "id"         text primary key,
  "userId"     text,
  "userName"   text,
  "action"     text not null,
  "targetType" text,
  "targetId"   text,
  "detail"     text,
  "at"         text not null
);
create index if not exists "idx_audit_at" on "AuditEvent" ("at");
-- The sign-in lockout counts recent failures per username from here.
create index if not exists "idx_audit_login_failed" on "AuditEvent" ("detail", "at") where "action" = 'login_failed';

create table if not exists "Setting" (
  "key"   text primary key,
  "value" text not null
);

-- day is the clinic's local date (Asia/Kolkata online), never a UTC date.
create table if not exists "QueueEntry" (
  "id"        text primary key,
  "patientId" text not null references "Patient" ("id") on delete cascade,
  "day"       text not null,
  "token"     integer not null,
  "status"    text not null check ("status" in ('waiting', 'with-doctor', 'done', 'left')),
  "addedBy"   text,
  "consultId" text,
  "calledBy"  text,
  "addedAt"   text not null,
  "calledAt"  text,
  "doneAt"    text
);
create index if not exists "idx_queue_day" on "QueueEntry" ("day");
create unique index if not exists "idx_queue_token" on "QueueEntry" ("day", "token");
-- Two desks adding the same patient at the same instant: SQLite's one-at-a-time
-- transactions never let that happen, Postgres's can. This makes the second
-- insert fail, and addToQueue then finds the first.
create unique index if not exists "idx_queue_once_per_day" on "QueueEntry" ("day", "patientId")
  where "status" in ('waiting', 'with-doctor');

-- Online only: a recording's 5-second slices, until the doctor signs and they
-- are deleted. On the clinic computer they are a file instead.
create table if not exists "AudioChunk" (
  "consultId" text    not null references "Consult" ("id") on delete cascade,
  "seq"       integer not null,
  "data"      bytea   not null,
  primary key ("consultId", "seq")
);
