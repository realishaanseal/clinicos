-- The speed pass (backlog #3): when the transcript and the AI draft arrived,
-- so the time each step of a consultation takes can be measured. The twin of
-- the addColumn calls in src/lib/sql.ts.

alter table "Consult" add column if not exists "transcribedAt" text;
alter table "Consult" add column if not exists "draftedAt" text;
