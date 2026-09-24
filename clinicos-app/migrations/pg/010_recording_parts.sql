-- A recording is made of parts, one per press of Record (24 Sep 2026). Each
-- part is a complete WebM stream with its own header, so two of them run onto
-- one another are not one longer recording — reading past the second header is
-- decoder-dependent, not promised. What was actually going wrong: re-transcribing
-- read the whole recording and replaced the transcript, so the first part's text
-- came back after the doctor had deleted it. The twin of the addColumn line in
-- src/lib/sql.ts.
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
