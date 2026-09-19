-- Billing and follow-up recall (backlog #12, #10, 20 Sep 2026). The twin of
-- the "Billing and follow-up recall" block in src/lib/sql.ts.
--
-- A bill holds what the desk typed ("Consultation", "Dressing") and never
-- anything clinical. Amounts are whole paise. A receipt number is given when
-- the bill is paid, never before: online numbers are plain, and a clinic
-- computer puts its own tag in front of its numbers (receiptPrefix), so the
-- two can never hand out the same one. A paid bill is only ever cancelled,
-- with a reason, never changed or deleted.
--
-- followUpOn is the date the doctor asked the patient back, copied from the
-- signed note. A Recall is what the desk did about a visit that came due: one
-- per visit, its id made from the visit's.
--
-- Additive: the version already running never reads or writes any of this.

alter table "Consult" add column if not exists "followUpOn" text;
create index if not exists "idx_consult_followup" on "Consult" ("clinicId", "followUpOn");

create table if not exists "Bill" (
  "id"            text primary key,
  "clinicId"      text not null references "Tenant" ("id"),
  "patientId"     text not null references "Patient" ("id") on delete cascade,
  -- [{"label": "Consultation", "amount": 30000}], amounts in paise
  "itemsJson"     text not null,
  "totalPaise"    integer not null,
  -- The clinic's local day the bill was made, like QueueEntry.day.
  "day"           text not null,
  "receiptNo"     text,
  "receiptPrefix" text,
  "receiptSeq"    integer,
  "paidAt"        text,
  "paidDay"       text,
  -- cash, upi, card or other
  "method"        text,
  "receivedBy"    text,
  "voidedAt"      text,
  "voidedBy"      text,
  "voidReason"    text,
  "createdBy"     text,
  "createdAt"     text not null,
  "updatedAt"     text,
  "syncedAt"      text,
  "syncOrigin"    text
);
create index if not exists "idx_bill_patient" on "Bill" ("clinicId", "patientId");
create index if not exists "idx_bill_day" on "Bill" ("clinicId", "day");
create index if not exists "idx_bill_paid" on "Bill" ("clinicId", "paidDay");
-- Two desks taking payment at the same instant can both read the same highest
-- number; this makes the second fail, and payBill() takes the next one.
create unique index if not exists "idx_bill_receipt" on "Bill" ("clinicId", "receiptNo") where "receiptNo" is not null;
create index if not exists "idx_bill_synced" on "Bill" ("clinicId", "syncedAt", "id");
drop trigger if exists "sync_Bill" on "Bill";
create trigger "sync_Bill" before insert or update on "Bill" for each row execute function clinicos_stamp_updated();

create table if not exists "Recall" (
  "id"        text primary key,
  "clinicId"  text not null references "Tenant" ("id"),
  "consultId" text not null references "Consult" ("id") on delete cascade,
  "patientId" text not null,
  "action"    text not null check ("action" in ('messaged', 'dismissed')),
  "at"        text not null,
  "byUser"    text,
  "updatedAt" text,
  "syncedAt"  text,
  "syncOrigin" text
);
create index if not exists "idx_recall_consult" on "Recall" ("clinicId", "consultId");
create index if not exists "idx_recall_synced" on "Recall" ("clinicId", "syncedAt", "id");
drop trigger if exists "sync_Recall" on "Recall";
create trigger "sync_Recall" before insert or update on "Recall" for each row execute function clinicos_stamp_updated();
