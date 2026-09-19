-- Keeping a clinic computer in step with its clinic online (19 Sep 2026), for
-- clinics whose plan includes it. The twin of migrateSyncTracking() in
-- src/lib/sql.ts.
--
-- Every row that can travel carries updatedAt (when it last changed, which
-- decides which copy wins when both changed) and syncedAt (when this database
-- last wrote it, by this database's own clock, which is what a clinic computer
-- asks "what changed since" against). Triggers keep both current, so no query
-- in db.ts has to remember to. A deleted patient or favourite leaves a
-- tombstone, so the deletion reaches the clinic computer too.
--
-- Additive: the version already running writes rows as before and the
-- triggers stamp them.

-- Milliseconds, like every other timestamp the app writes, so the two compare
-- as plain text.
create or replace function clinicos_now() returns text language sql volatile as $$
  select to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$$;

-- Which clinic computer made this change, if one did: set for the length of
-- the transaction that writes a computer's changes, so they are not sent back
-- to the computer they came from. Empty for every change made online.
create or replace function clinicos_origin() returns text language sql stable as $$
  select nullif(current_setting('clinicos.device', true), '')
$$;

-- For tables with updatedAt: stamp it unless the statement set it itself (as
-- applying a change from a clinic computer does), and always stamp syncedAt.
create or replace function clinicos_stamp_updated() returns trigger language plpgsql as $$
begin
  new."syncedAt" := clinicos_now();
  new."syncOrigin" := clinicos_origin();
  if tg_op = 'INSERT' then
    if new."updatedAt" is null then new."updatedAt" := new."syncedAt"; end if;
  elsif new."updatedAt" is not distinct from old."updatedAt" then
    new."updatedAt" := new."syncedAt";
  end if;
  return new;
end $$;

-- For tables that are only ever added to.
create or replace function clinicos_stamp_synced() returns trigger language plpgsql as $$
begin
  new."syncedAt" := clinicos_now();
  new."syncOrigin" := clinicos_origin();
  return new;
end $$;

-- id is "<clinic>:<table>:<row id>": one clinic's deletions can never be
-- confused with, or stand in the way of, another's.
create table if not exists "SyncTombstone" (
  "id"        text primary key,
  "clinicId"  text not null,
  "tableName" text not null,
  "rowId"     text not null,
  "deletedAt" text not null,
  "syncedAt"  text not null,
  "syncOrigin" text
);
create index if not exists "idx_tombstone_clinic_synced" on "SyncTombstone" ("clinicId", "syncedAt", "id");

create or replace function clinicos_tombstone() returns trigger language plpgsql as $$
begin
  insert into "SyncTombstone" ("id", "clinicId", "tableName", "rowId", "deletedAt", "syncedAt", "syncOrigin")
  values (old."clinicId" || ':' || tg_table_name || ':' || old."id", old."clinicId", tg_table_name, old."id",
          clinicos_now(), clinicos_now(), clinicos_origin())
  on conflict ("id") do update
    set "deletedAt" = excluded."deletedAt", "syncedAt" = excluded."syncedAt", "syncOrigin" = excluded."syncOrigin";
  return old;
end $$;

alter table "Patient"       add column if not exists "updatedAt" text;
alter table "Consult"       add column if not exists "updatedAt" text;
alter table "User"          add column if not exists "updatedAt" text;
alter table "QueueEntry"    add column if not exists "updatedAt" text;
alter table "ClinicSetting" add column if not exists "updatedAt" text;

alter table "Patient"       add column if not exists "syncedAt" text;
alter table "Consult"       add column if not exists "syncedAt" text;
alter table "Edit"          add column if not exists "syncedAt" text;
alter table "User"          add column if not exists "syncedAt" text;
alter table "QueueEntry"    add column if not exists "syncedAt" text;
alter table "Favourite"     add column if not exists "syncedAt" text;
alter table "AuditEvent"    add column if not exists "syncedAt" text;
alter table "ClinicSetting" add column if not exists "syncedAt" text;

alter table "Patient"       add column if not exists "syncOrigin" text;
alter table "Consult"       add column if not exists "syncOrigin" text;
alter table "Edit"          add column if not exists "syncOrigin" text;
alter table "User"          add column if not exists "syncOrigin" text;
alter table "QueueEntry"    add column if not exists "syncOrigin" text;
alter table "Favourite"     add column if not exists "syncOrigin" text;
alter table "AuditEvent"    add column if not exists "syncOrigin" text;
alter table "ClinicSetting" add column if not exists "syncOrigin" text;

drop trigger if exists "sync_Patient" on "Patient";
create trigger "sync_Patient" before insert or update on "Patient" for each row execute function clinicos_stamp_updated();
drop trigger if exists "sync_Consult" on "Consult";
create trigger "sync_Consult" before insert or update on "Consult" for each row execute function clinicos_stamp_updated();
drop trigger if exists "sync_User" on "User";
create trigger "sync_User" before insert or update on "User" for each row execute function clinicos_stamp_updated();
drop trigger if exists "sync_QueueEntry" on "QueueEntry";
create trigger "sync_QueueEntry" before insert or update on "QueueEntry" for each row execute function clinicos_stamp_updated();
drop trigger if exists "sync_ClinicSetting" on "ClinicSetting";
create trigger "sync_ClinicSetting" before insert or update on "ClinicSetting" for each row execute function clinicos_stamp_updated();
drop trigger if exists "sync_Favourite" on "Favourite";
create trigger "sync_Favourite" before insert or update on "Favourite" for each row execute function clinicos_stamp_updated();
drop trigger if exists "sync_Edit" on "Edit";
create trigger "sync_Edit" before insert or update on "Edit" for each row execute function clinicos_stamp_synced();
drop trigger if exists "sync_AuditEvent" on "AuditEvent";
create trigger "sync_AuditEvent" before insert or update on "AuditEvent" for each row execute function clinicos_stamp_synced();

drop trigger if exists "sync_Patient_del" on "Patient";
create trigger "sync_Patient_del" after delete on "Patient" for each row execute function clinicos_tombstone();
drop trigger if exists "sync_Favourite_del" on "Favourite";
create trigger "sync_Favourite_del" after delete on "Favourite" for each row execute function clinicos_tombstone();

-- Rows from before tracking get their first stamps.
update "Patient"       set "updatedAt" = "createdAt" where "updatedAt" is null;
update "Consult"       set "updatedAt" = "createdAt" where "updatedAt" is null;
update "User"          set "updatedAt" = "createdAt" where "updatedAt" is null;
update "QueueEntry"    set "updatedAt" = "addedAt"   where "updatedAt" is null;
update "ClinicSetting" set "updatedAt" = clinicos_now() where "updatedAt" is null;
update "Favourite"     set "syncedAt" = clinicos_now() where "syncedAt" is null;
update "Edit"          set "syncedAt" = clinicos_now() where "syncedAt" is null;
update "AuditEvent"    set "syncedAt" = clinicos_now() where "syncedAt" is null;

-- A clinic computer asks each table for "what changed since", clinic by clinic.
create index if not exists "idx_patient_synced"    on "Patient" ("clinicId", "syncedAt", "id");
create index if not exists "idx_consult_synced"    on "Consult" ("clinicId", "syncedAt", "id");
create index if not exists "idx_edit_synced"       on "Edit" ("clinicId", "syncedAt", "id");
create index if not exists "idx_user_synced"       on "User" ("clinicId", "syncedAt", "id");
create index if not exists "idx_queue_synced"      on "QueueEntry" ("clinicId", "syncedAt", "id");
create index if not exists "idx_favourite_synced"  on "Favourite" ("clinicId", "syncedAt", "id");
create index if not exists "idx_audit_synced"      on "AuditEvent" ("clinicId", "syncedAt", "id");
create index if not exists "idx_setting_synced"    on "ClinicSetting" ("clinicId", "syncedAt", "key");

-- The clinic computers allowed to keep in step with a clinic. Each proves
-- itself with a key shown once when it is connected; only the key's hash is
-- kept, and switching a computer off ends its access at once.
create table if not exists "SyncDevice" (
  "id"          text primary key,
  "clinicId"    text not null references "Tenant" ("id"),
  "name"        text not null,
  "keyHash"     text not null unique,
  "createdAt"   text not null,
  "createdBy"   text,
  "lastSeenAt"  text,
  -- Seconds the computer's clock was ahead (+) or behind (-) at its last sync.
  "clockOffset" integer,
  "revokedAt"   text
);
create index if not exists "idx_syncdevice_clinic" on "SyncDevice" ("clinicId");
