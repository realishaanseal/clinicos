-- Clinics as tenants (19 Sep 2026): the online copy becomes a service many
-- clinics share, each seeing only its own records. The twin of the "Clinics as
-- tenants" block in src/lib/sql.ts.
--
-- Additive, as every migration here must be: the version already live keeps
-- working while this runs. Every new column defaults to the first clinic, so an
-- insert from the old code lands where it always did, and each unique index is
-- replaced by its per-clinic version only after that version exists.
--
-- The table is "Tenant" because "Clinic" already belongs to the patient
-- portal's tables in this database.

create table if not exists "Tenant" (
  "id"            text primary key,
  -- The clinic's address: vxclinicos.vercel.app/app/c/<slug>
  "slug"          text not null unique,
  "name"          text not null,
  -- Set by Varaxis. A paused clinic can still sign in and export everything.
  "status"        text not null default 'active' check ("status" in ('active', 'suspended')),
  "plan"          text not null default 'cloud',
  -- What the clinic's purchase switched on, as JSON: {"localSync": true}
  "features"      text not null default '{}',
  -- A clinic's own web address, if it has one.
  "domain"        text unique,
  -- SHA-256 of the one-time code that creates the clinic's first account.
  "setupCodeHash" text,
  "paidUntil"     text,
  "notes"         text,
  "createdAt"     text not null,
  "updatedAt"     text not null
);

insert into "Tenant" ("id", "slug", "name", "createdAt", "updatedAt")
values (
  'first',
  'first',
  coalesce((select "value" from "Setting" where "key" = 'clinic_name'), 'First clinic'),
  to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
)
on conflict do nothing;

-- Clinic details, per clinic. "Setting" was the one clinic's; it is copied
-- here and left as it was for the version still running.
create table if not exists "ClinicSetting" (
  "clinicId" text not null references "Tenant" ("id"),
  "key"      text not null,
  "value"    text not null,
  primary key ("clinicId", "key")
);
insert into "ClinicSetting" ("clinicId", "key", "value")
select 'first', "key", "value" from "Setting"
on conflict do nothing;

alter table "Patient"    add column if not exists "clinicId" text not null default 'first' references "Tenant" ("id");
alter table "Consult"    add column if not exists "clinicId" text not null default 'first' references "Tenant" ("id");
alter table "Edit"       add column if not exists "clinicId" text not null default 'first' references "Tenant" ("id");
alter table "User"       add column if not exists "clinicId" text not null default 'first' references "Tenant" ("id");
alter table "QueueEntry" add column if not exists "clinicId" text not null default 'first' references "Tenant" ("id");
alter table "Favourite"  add column if not exists "clinicId" text not null default 'first' references "Tenant" ("id");
-- No foreign key: the log outlives anything it mentions, and an event about
-- the platform itself belongs to no clinic.
alter table "AuditEvent" add column if not exists "clinicId" text default 'first';

create index if not exists "idx_patient_clinic" on "Patient" ("clinicId", "createdAt");
create index if not exists "idx_consult_clinic" on "Consult" ("clinicId", "createdAt");
create index if not exists "idx_edit_clinic"    on "Edit" ("clinicId");
create index if not exists "idx_audit_clinic"   on "AuditEvent" ("clinicId", "at");
create index if not exists "idx_audit_clinic_login_failed" on "AuditEvent" ("clinicId", "detail", "at")
  where "action" = 'login_failed';

-- Usernames are unique within a clinic; two clinics may both have a "reception".
create unique index if not exists "idx_user_clinic_username" on "User" ("clinicId", lower("username"));
drop index if exists "idx_user_username";

-- Tokens restart at 1 each day in each clinic, and a patient is on a clinic's
-- list once a day.
create unique index if not exists "idx_queue_clinic_token" on "QueueEntry" ("clinicId", "day", "token");
drop index if exists "idx_queue_token";
create unique index if not exists "idx_queue_clinic_once_per_day" on "QueueEntry" ("clinicId", "day", "patientId")
  where "status" in ('waiting', 'with-doctor');
drop index if exists "idx_queue_once_per_day";

-- Varaxis's own accounts, for setting clinics up and changing their plans.
-- Nothing here opens a clinic's records: there is no query in the app that
-- lets an operator read a patient.
create table if not exists "Operator" (
  "id"                 text primary key,
  "name"               text not null,
  "username"           text not null,
  "passwordHash"       text not null,
  "active"             integer not null default 1,
  "mustChangePassword" integer not null default 1,
  "createdAt"          text not null,
  "lastLoginAt"        text
);
create unique index if not exists "idx_operator_username" on "Operator" (lower("username"));

create table if not exists "OperatorSession" (
  "tokenHash"  text primary key,
  "operatorId" text not null references "Operator" ("id") on delete cascade,
  "createdAt"  text not null,
  "expiresAt"  text not null,
  "lastSeenAt" text not null
);
create index if not exists "idx_operatorsession_operator" on "OperatorSession" ("operatorId");
