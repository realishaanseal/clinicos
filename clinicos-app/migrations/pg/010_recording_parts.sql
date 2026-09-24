-- A recording is made of parts, one per press of Record (24 Sep 2026). Each
-- part is a complete WebM stream with its own header, so two of them run
-- together are not one longer recording: a decoder reads the first and stops at
-- the second's header. Everything said after "Record again" was being thrown
-- away, and re-transcribing put the first part's text back after the doctor had
-- deleted it. The twin of the addColumn line in src/lib/sql.ts.
--
-- Additive and safe to apply while the previous version serves: every slice
-- already stored belongs to part 1, and the version still running ignores the
-- column.

-- Which part of the recording a slice belongs to.
alter table "AudioChunk" add column if not exists "part" integer not null default 1;

-- How many parts the consultation's transcript already covers, so transcribing
-- after "Record again" adds what was just said instead of doing the whole visit
-- over. It never travels to a clinic computer: neither does the recording.
alter table "Consult" add column if not exists "transcribedParts" integer not null default 0;
