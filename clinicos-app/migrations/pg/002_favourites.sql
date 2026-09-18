-- A doctor's own saved prescriptions (backlog #15, #16). The twin of the
-- Favourite table in src/lib/sql.ts: a name and the plan part of a note
-- (diagnosis, medicines, tests, advice, follow-up), never a patient's complaint
-- or findings. One name per doctor, whatever its case.

create table if not exists "Favourite" (
  "id"        text primary key,
  "userId"    text not null references "User" ("id") on delete cascade,
  "name"      text not null,
  "noteJson"  text not null,
  "useCount"  integer not null default 0,
  "createdAt" text not null,
  "updatedAt" text not null
);
create unique index if not exists "idx_favourite_name" on "Favourite" ("userId", lower("name"));
