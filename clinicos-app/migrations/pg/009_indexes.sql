-- Indexes the everyday screens ask for, as clinics grow (20 Sep 2026). The
-- twin of the block after the Bill and Recall tables in src/lib/sql.ts.
--
-- Additive and safe to apply while the previous version serves: an index only
-- makes the same queries faster.

-- A patient's visits in order: their history, the last visit strip, and
-- "has this patient been back since?" on the follow-up list.
create index if not exists "idx_consult_clinic_patient" on "Consult" ("clinicId", "patientId", "createdAt");
-- A patient's place on any day's list, for the same question.
create index if not exists "idx_queue_clinic_patient" on "QueueEntry" ("clinicId", "patientId", "addedAt");
-- A visit's corrections, counted on every row of a patient's history.
create index if not exists "idx_edit_clinic_consult" on "Edit" ("clinicId", "consultId");
