# ClinicOS — working context

Read this before changing anything. It exists so a session on any machine starts
with the same understanding, and so that decisions already argued through are not
quietly reversed.

**What is built and live, every decision already made, and what comes next are in
[CONTEXT.md](CONTEXT.md).** Read it as well, and update it when you finish a piece of
work. These rules apply to every assistant, not only Claude; `AGENTS.md` points
other tools here.

---

## What this is

A local-first consultation-documentation assistant for single-doctor rural clinics
in India. Field site: Krishnanagar, Nadia, West Bengal.

The doctor gets roughly two minutes per patient. In that time they must greet,
take a history, examine, explain, prescribe **and** record. The record is what gets
dropped. ClinicOS records the consultation that was already happening, transcribes
it locally, drafts a structured clinical note, and asks the doctor only to review
and sign. A branded prescription prints from the signed note.

It runs two ways, from one codebase:

- **On a clinic's own computer** (SQLite): no cloud and no internet required, accounts
  on that laptop only. How ClinicOS began, and still fully supported.
- **Online, as a service clinics buy** (Postgres, since 19 Sep 2026 by Ishaan's
  decision): many clinics share one database and each sees only its own records.
  Varaxis creates each clinic from its platform console when it buys. A clinic whose
  plan includes it can also keep a full copy on its own computer, in step with its
  clinic online — a paid add-on Varaxis switches on per clinic.

**Owner:** Ishaan Seal — part-time student founder, near-zero capital. Assume
constrained time and money in every recommendation.

---

## Non-negotiable invariants

Violating any of these changes what the project legally or ethically is. Do not
trade them away for a feature.

1. **No clinical judgement.** No diagnosis generation, no risk scores, no triage
   badges, no "high attention" flags. Under India's CDSCO rules, software limited
   to storing, formatting and communicating data sits outside medical-device
   regulation; software that quantifies a physiological parameter to drive a
   clinical decision does not. Show raw numbers and trends; let the doctor set
   any flag. Backlog items 26–35 are marked risky for exactly this reason.
2. **Identifiable data goes only where the clinic chose to keep it.** No telemetry
   containing consultation content, no exceptions "just for testing".
   - A clinic computer that is not connected sends nothing anywhere.
   - A clinic computer reaches the cloud only through sync: its clinic's plan must
     include it (set by Varaxis), and the clinic's admin must connect it with a key
     made online. Nothing else in a clinic-computer install may call out.
   - Online, one clinic's records are never shown to, sent to, or changed by another
     clinic, and never opened by Varaxis: the platform console shows counts only.
   - The online copy keeps records in Supabase (Mumbai) and would send audio to a
     hosted AI service. Patients are not yet told that, and the online database keeps
     no backups, so the online copy is a prototype for made-up patients only, says so on
     every screen, and a clinic computer connecting to it must confirm its patients are
     made up. Only Ishaan lifts this (`NEXT_PUBLIC_CLINICOS_PROTOTYPE=0`).
3. **Audio is deleted when the doctor signs.** Promised to every patient under the
   clinic's terms (`lib/terms.ts`), and enforced in `signConsult()`. Do not add audio retention.
   Recordings never sync; a visit signed on one copy deletes the other copy's
   recording of it when the signature arrives (`mergeConsult()` in `sync.ts`).
4. **Never train on patient audio.** Settled decision. Pilot Agreement clause 8
   permits de-identified data only, with an opt-out.
5. **Recording is allowed only on a basis the server checks.** Since 20 Sep 2026
   (Ishaan's decision) that basis is the clinic's one-time acceptance of ClinicOS's
   terms — at setup or in Clinic admin — in which it undertakes to tell every patient
   and record no one who says no. The recording endpoints return 403 until the terms
   in force are accepted (`allowRecording()` in `clinic.ts`), and mark each recorded
   visit with that basis (`consentBy`). There is no per-visit consent screen any more.
   A UI-only gate is still not acceptable, and a change to the terms' text needs a new
   version, which everyone accepts again.
6. **`draftJson` is immutable once written.** It holds the AI's original output.
   Doctor edits go to `workingJson`, and the diff between them at signing is the
   accuracy metric. Never overwrite `draftJson` with edited content.
7. **Backups use SQLite's online backup API, never a file copy.** See gotchas.
8. **No lock-in.** Full export in an open format must keep working.

---

## Running it

```bash
cd "~/Desktop/Varaxis/ClinicOS - By Varaxis/clinicos-app"
./go.sh          # sets up whatever is missing, then starts everything
```

`go.sh` is idempotent. It installs npm packages, rebuilds `better-sqlite3` if its
native binary did not compile, creates the Python virtualenv for the ASR sidecar,
locates Ollama, and starts the app.

There is a shell alias on the primary laptop: `clinic` starts it, `clinicstop`
stops it, `cliniclog` tails the log. These are not in the repo — recreate them in
`~/.zshrc` on a new machine if wanted.

Three processes: Next.js on `:3000`, the faster-whisper sidecar on `:8756`, and
Ollama on `:11434`.

**Prerequisites on a fresh machine:** Node.js, Python 3, and Ollama installed as a
Mac app (`ollama pull qwen2.5:7b-instruct`). Homebrew is *not* required — `go.sh`
looks for Ollama at several paths.

Copy `.env.example` to `.env`. On the first run the app opens `/setup` to create the
owner account — do this straight away, because until an account exists anyone who
reaches the app could claim it. Clinic details are then edited in Clinic admin; the
clinic fields in `.env` are only a fallback and still default to "Demo Clinic" /
"Dr. Demo".

### On Windows

`go.sh` is macOS-only — it shells out to `brew`, looks for `Ollama.app`, and calls
`open`. `go.ps1` is its Windows twin and keeps the same contract: idempotent, sets
up whatever is missing, starts the same three processes.

```powershell
cd "$HOME\Desktop\ClinicOS - By Varaxis\clinicos-app"
powershell -ExecutionPolicy Bypass -File .\go.ps1
```

Prerequisites: `winget install OpenJS.NodeJS.LTS`, `winget install Python.Python.3.12`,
`winget install Ollama.Ollama`. If `better-sqlite3` has no prebuilt binary for the
installed Node version it falls back to a source build, which needs
`winget install Microsoft.VisualStudio.2022.BuildTools` — `go.ps1` says so when it
happens rather than failing obscurely.

`npm run asr` is POSIX-only; use `npm run asr:win` on Windows.

Keep `go.sh` and `go.ps1` in step. If you change setup logic in one, change both —
the field laptop and the dev laptop are not the same OS.

---

### Online (vxclinicos.vercel.app/app)

The same code runs online. The website project (`demo`) owns the address and rewrites
`/app` to the app's own Vercel project, `vxclinicos-app` (Root Directory
`clinicos-app`, functions in `bom1`). What makes it the online copy is environment
variables on that project, never a code branch:

| Variable | Online value | Effect |
|---|---|---|
| `DATA_BACKEND` | `postgres` | Postgres instead of the SQLite file; recordings in `AudioChunk` |
| `DATABASE_URL` | Supabase transaction pooler (6543) | the database |
| `SETUP_CODE` | random | the **first** clinic's `/setup` only; every clinic Varaxis creates gets its own one-time code |
| `NEXT_PUBLIC_BASE_PATH` | `/app` | Next.js `basePath`; `appPath()` for hand-written paths |
| `NEXT_PUBLIC_CLINIC_TIMEZONE` | `Asia/Kolkata` | "today" and every time on screen (Vercel runs on UTC) |
| `NEXT_PUBLIC_CLINICOS_ONLINE` | `1` | wording only: no "running locally" |
| `NEXT_PUBLIC_CLINICOS_PROTOTYPE` | unset (banner on) | `0` removes the made-up-patients banner — Ishaan's decision, once Part D is done (invariant 2) |
| `ASR_PROVIDER` / `LLM_PROVIDER` | `http` / `openai` | hosted AI; needs URLs, models and keys |
| `PORTAL_ENCRYPTION_KEY` / `PORTAL_HMAC_KEY` | from `npm run portal:keys` | the patient portal; set once — changing them loses what was shared |

Schema changes for the online copy are numbered files in
`clinicos-app/migrations/pg/`. Every SQLite change in `sql.ts` needs its Postgres twin
there, and the other way round. **Production deploys apply them**: the app project's
build command (`clinicos-app/vercel.json`) runs `migrate-pg.mjs --deploy` before
`next build`, so the schema lands before the code that needs it, and a failed
migration fails the build while the live version keeps serving. Preview builds never
migrate — they share the production database — so a branch that adds a table shows
errors on its Preview until it reaches `main`. Migrations must be **additive**: safe to
apply while the previous version is still running. `npm run migrate:pg` still works by
hand.

---

## Architecture

Next.js 15 App Router, React 19, TypeScript. SQLite via `better-sqlite3` on the clinic
computer, Postgres via `postgres` online, hand-written SQL for both. **There is no
ORM.** Prisma was removed early — its engine downloads were blocked — and it is not
coming back.

```
clinicos-app/
  src/lib/
    sql.ts           the only file that knows SQLite from Postgres: connections,
                     transactions (AsyncLocalStorage), SQLite schema + migrations
    db.ts            every query, async, written once for both databases. no ORM.
    time.ts          the clinic's day and clock (CLINIC_TIMEZONE); fmt/fmtDate/fmtTime
    audio-store.ts   recordings: a file locally, AudioChunk rows online
    base-path.ts     appPath() for paths written by hand under /app online
    deployment.ts    ONLINE flag — wording only, never a security control
    setup-code.ts    the /setup code check: each clinic's own one-time code, or SETUP_CODE
    tenant.ts        which clinic a sign-in is for (/c/<slug>, remembered, domain, only one);
                     plans and features (localSync)
    platform.ts      Varaxis's operator sessions for the platform console (online only)
    sync.ts          what travels between a clinic computer and its clinic online, and how
                     the other copy's rows are merged — the same code on both sides
    sync-server.ts   online: device keys (hash only) and requireDevice() for /api/sync/*
    sync-client.ts   clinic computer: connect, run every minute, status. Never awaited by a page
    share.ts         sharing a signed visit with the patient: shareVisit / revokeShare (online)
    portal.ts        patients' accounts and sessions: phone + printed code, then a PIN
    portal-crypto.ts the portal's secrets: AES-GCM prescriptions, HMAC'd phones, hashed codes
    auth.ts          passwords (scrypt), sessions, requireUser / requireApiUser, roles
    session-cookie.ts  cookie name + idle limit shared with middleware (no Node imports)
    users.ts         role labels and account validation, safe for client components
    backup.ts        snapshot / restore / retention
    asr.ts           speech-to-text provider interface (local | http)
    llm.ts           note generation provider interface (ollama | openai)
                     SYSTEM_PROMPT lives here — the clinical safety text
    types.ts         ClinicalNote shape and parseNote()
    terms.ts         the clinic's terms (what lets it record) and the patient portal's, in 3 languages
    portal-words.ts  every word of the patient portal in English, Bengali and Hindi
    money.ts         bills in whole paise: parsing rupees, ₹ with Indian grouping, bill lines
    recall.ts        the follow-up reminder: its template and the wa.me link the desk taps
    day-summary.ts   the day in one message for the owner: counts and money, never a patient
    clinic.ts        clinic identity: ClinicSetting first, .env as fallback (first clinic only)
    useRecorder.ts   streams 5-second audio chunks to disk while recording
    useAutosave.ts   debounced server save + localStorage mirror
    useQueue.ts      polls today's list every 5 seconds while the tab is visible
  src/middleware.ts       redirects to /login when there is no session cookie (only);
                          /platform has its own cookie; /api/sync/* checks its own key
  src/components/
    ConsultWorkflow.tsx   the 4-step consultation UI
    Prescription.tsx      printable A4 prescription
    FrontDeskToday.tsx    the front desk's Today: find, register, today's list
    BillsDesk.tsx         bills: make one, take payment, cancel (typed CANCEL)
    Receipt.tsx           the printed receipt: nothing clinical on it
    FollowUps.tsx         patients asked back and not yet back; Message on WhatsApp
    DaySummary.tsx        the day in one message, shown before it is sent
    WaitingPanel.tsx      the doctor's "Waiting now" and Start visit
    Favourites.tsx        the doctor's own saved prescriptions, in the note editor
    QuickSearch.tsx       Ctrl+K / ⌘K search from any screen (a native <dialog>)
    BackupPanel.tsx       clinic admin: backup, restore, export
    DeletePatient.tsx     type-the-name-to-confirm deletion
    UsersAdmin.tsx        clinic admin: add people, manage access, reset passwords
    SyncPanel.tsx         clinic computer: connect to the clinic online, and how it is going
    DevicesPanel.tsx      online: the clinic's connected computers, keys, switching off
  src/app/(clinic)/       every clinic screen, inside the clinic's navigation (a route group:
                          no change to addresses)
  src/app/setup, login    first-run owner account; sign-in
  src/app/c/[slug]        a clinic's own address: its setup until it has an account, then sign-in
  src/app/platform/       Varaxis's console: clinics, plans, pausing. Counts only, never records
  src/app/p/              the patient portal (online only): a patient's shared prescriptions
  src/app/api/            route handlers — every one starts with requireApiUser(), except
                          /api/platform (requireApiOperator) and /api/sync (requireDevice)
  scripts/reset-password.mjs   npm run reset-password -- <username> [clinic-id], at the laptop
  scripts/operator.mjs         npm run operator -- add|reset|deactivate: operator accounts, online
  scripts/dev-sandbox.mjs      npm run dev:sandbox — the app on :3002 against .sandbox/;
                               dev:sandbox:pg — the online service there, on PGlite
  scripts/test/           npm run test:e2e — see Tooling
  asr/server.py           FastAPI + faster-whisper sidecar
  go.sh                   setup and launch
landing/                  public website. static Next.js, no database, no API
                          routes, no access to clinicos-app. see landing/README.md
docs/                     launch plan, backlog, consent script, agreements
artifacts/                decks, trackers, briefs
```

**Headers.** The app sends its own on every page and route (`next.config.ts`): a
content security policy that allows nothing off-origin, `X-Frame-Options: DENY`,
`X-Robots-Tag: noindex` (a clinic's app is nobody's search result), and a permissions
policy that closes the camera and location but leaves the microphone alone — closing it
would stop consultations being recorded. The website leaves `/app` alone, so these are
what a clinic gets.

**Provider abstraction:** ASR and LLM both sit behind small interfaces so a hosted
endpoint can replace the local one through env vars alone. Keep it that way — do
not call Ollama or Whisper directly from a component or route.

**Schema migrations:** SQLite has no `ADD COLUMN IF NOT EXISTS`. `sql.ts` reads
`PRAGMA table_info` and conditionally runs `ALTER TABLE`. Safe to re-run. Existing
pilot databases must survive upgrades — never drop and recreate a table. Postgres
changes go in `migrations/pg/` as new numbered files; never edit an applied one.

**One SQL for two databases** (the rules are at the top of `sql.ts`): `?`
placeholders; double-quote every identifier with a capital letter (`"Consult"`,
`"patientId"`), because Postgres folds unquoted names to lowercase and rows would come
back as `patientid`; `CAST(COUNT(*) AS INTEGER)`; `LOWER()` for case-insensitive
matches instead of SQLite's `LIKE`/`COLLATE NOCASE`; ISO-string timestamps and 0/1
flags in both. A race SQLite cannot have (its transactions run one at a time) can
happen on Postgres — see `addToQueue`, `startQueueEntry` and `createFirstAccount`.

Tables: `Patient`, `Consult`, `Edit`, and since v0.5 `User`, `Session`, `AuditEvent`,
`Setting` (no longer written), `QueueEntry`, `Favourite`. Since 19 Sep 2026 `Tenant` (the
clinics — `Clinic` belongs to the old standalone portal's unused tables in the same
database), `ClinicSetting`, `SyncTombstone`, `PortalShare`; since 20 Sep 2026 `Bill`, `Recall`; SQLite only `SyncState`,
`SyncConfig`; Postgres only `AudioChunk`, `Operator`, `OperatorSession`, `SyncDevice`,
`PortalAccount`, `PortalLogin`, `PortalAttempt`.

**Clinics are tenants.** Every table of records has `clinicId`, and every function in
`db.ts` that touches records takes a `ClinicId` first and filters on it — in the WHERE of
updates and deletes too, so a missed check upstream still cannot reach another clinic.
`ClinicId` is a branded type: it comes only from the signed-in session
(`user.clinicId`), a verified device key or a tenant lookup, and passing a record id in
its place does not compile. A clinic computer holds one clinic, `FIRST_CLINIC_ID`
(`"first"`), which every pre-SaaS row belongs to by default; online, `first` is the
original prototype clinic. Usernames are unique within a clinic. A new query that
forgets `"clinicId" = ?` is a data leak between clinics: `tenancy-test.cjs` tries every
route with another clinic's ids, and a new route must be added to it.

**The platform console** (`/platform`, online only) is Varaxis's: operators are made with
`npm run operator` from a computer holding the database string — never from a screen —
and sign in with their own cookie. It creates clinics (name, ID, plan, whether clinic
computer sync is included), issues one-time setup codes, and pauses a clinic. It shows
counts, never a record; operator changes are written into the clinic's own activity log
as "Varaxis (name)". A paused clinic's admins can still sign in and export everything.

**Keeping a clinic computer in step (sync).** Triggers, not queries, keep `updatedAt` and
a change marker on every row that travels: `syncSeq` from a counter on SQLite (a clinic's
clock may be wrong), `syncedAt` from the database clock online, plus `syncOrigin` so a
computer is not sent its own changes back. While merging, SQLite's triggers stand aside
(`SyncState.applying`) and merged rows get `syncSeq = -1` so they are not sent back. The
merge rules are at the top of `sync.ts` and hold for both sides. **Adding a column to a
synced table means adding it to `COLUMNS` in `sync.ts`**, or it silently stays on one
copy; a new table needs a decision about whether it travels. Settings travel only when
their key starts `clinic_` or `rx_`.

**Sharing with the patient (the portal).** One tap after signing; nothing is read out.
The patient chooses a language (English, Bengali, Hindi) on the portal's first screen
and agrees to its terms once, at their first sign-in (`PortalAccount.termsVersion`);
the portal then speaks their language (`portal-words.ts`), while the prescription stays
as the doctor wrote it. The share is made
online: directly there, or by a connected clinic computer through `/api/sync/share`. What
the patient gets is exactly the signed prescription, encrypted with
`PORTAL_ENCRYPTION_KEY` — never the transcript, recording, draft or edits. Phone numbers
are stored only as an HMAC (`PORTAL_HMAC_KEY`), the printed code only as a hash, the PIN
only as scrypt. The code is shown once, printed with a QR code whose `#code=` fragment is
never sent to a server; a new code replaces a lost one. `PortalShare`'s three secret
columns never sync. Without the two keys set, the Share button says so.

**A note written by hand has no AI draft** (a quick visit, or a patient who said no to
recording). `draftJson` stays NULL, signing logs no `Edit` rows, and it counts in
neither "time saved" nor "edits per note" — both are per AI-drafted note. Never diff a
signed note against an empty draft.

**Favourites hold the plan only** — diagnosis, medicines, tests, advice, follow-up —
never a complaint, history or findings (`planOf()` in `types.ts`), and each doctor sees
only their own. ClinicOS ships none: a pre-written treatment would be clinical advice
(invariant 1). Applying one never overwrites what is already written.

**Bills hold money, never medicine.** A bill is what the desk typed ("Consultation",
"Dressing") and amounts in whole paise (`money.ts`); whoever takes money reads it, so
nothing clinical reaches a bill, a receipt or the bills desk. A receipt number is given at
payment, never at billing: plain online (`0042`), and on a clinic computer behind its own
three-letter tag (`KTR-0042`) kept in the `receipt_tag` setting, which never travels — so
no two copies can print the same number. A bill is never edited or deleted, only
cancelled: `admin`, a reason, and typed `CANCEL`. The reason stays on the bill, not in
the activity log, because it is free text and could name the patient. In sync, a payment or
a cancellation recorded on either copy stands (`mergeBill()` in `sync.ts`).

**What goes to the owner over WhatsApp** — the day's summary (#13) and the follow-up
reminders (#10) — is counts, money and one patient's name at most, never a diagnosis, and
ClinicOS never sends it: a `wa.me` link opens WhatsApp with the words in it, and a person
presses send. What the follow-up list is worth (#11) is the clinic's own fee times the
people on it, labelled as that arithmetic and never as a forecast.

**A follow-up date is the doctor's.** `followUpOn` on the note is never filled by the AI
(`llm.ts`), is not a correction, and is not part of a favourite. Signing copies it to
`Consult.followUpOn`. The desk's Follow-ups list shows name, phone, date and doctor —
never why — and the reminder comes from a template whose only placeholders are `{name}`,
`{clinic}`, `{doctor}` and `{date}`. ClinicOS sends nothing: the desk taps a `wa.me`
link and presses send in WhatsApp themselves.

**Accounts and permissions (v0.5).** The first run opens `/setup`, which creates the
owner account and then refuses forever. Every page calls `requireUser()` and every
route handler calls `requireApiUser()` with the capability it needs — hiding a link
is never the control:

| Capability | doctor | staff | admin |
|---|---|---|---|
| `clinical` — transcripts, notes, signing, prescriptions, patient history | yes | no | no |
| `frontdesk` — register and find patients, today's list, follow-ups | yes | yes | no |
| `admin` — people, clinic details, backups, export, deletion, activity log | if `isAdmin` | no | yes |
| `billing` — make bills, take payment, print receipts (cancelling needs `admin`) | yes | yes | yes |

- A non-clinical admin never sees clinical notes. A doctor who owns the clinic is
  `role=doctor, isAdmin=1`.
- `middleware.ts` runs on the Edge runtime, where `better-sqlite3` cannot load, so it
  only checks that a session cookie exists. The real check is always in the handler.
- Only SHA-256 hashes of session tokens are stored. Sessions slide on a 12-hour idle
  limit so nobody is signed out mid-recording.
- Never write a patient's name into `AuditEvent.detail`: a deleted record must not
  survive in the activity log.
- A restore brings back the backup's accounts. If the backup predates accounts, the
  restoring admin is kept so `/setup` never reopens.
- Clinic identity is edited in Clinic admin (`Setting`); `.env` is only the fallback.
  A locked-out owner runs `npm run reset-password -- <username>` at the laptop.
- The front desk's Today renders before any clinical query runs. Keep it that way:
  nothing clinical may reach a page or API a front-desk account can open.
- "Today" means the clinic computer's local date (`localDay()` in `db.ts`), never the
  UTC date — in India a UTC date files everything before 05:30 under yesterday.

---

## Gotchas that have already cost time

- **WAL mode makes `cp clinicos.db backup.db` dangerous.** Recent writes live in a
  separate `-wal` file. The copy opens fine and is quietly missing the most recent
  consultations. This was demonstrated live: a 4 KB main file with a 453 KB WAL
  produced a backup that errored with "no such table: Patient". Always use
  `Database.prototype.backup()`.
- **npm 12 blocks install scripts by default.** `better-sqlite3`'s native binary
  silently fails to install, `npm install` reports success, and the app crashes on
  first database access. `package.json` has an `allowScripts` allowlist and
  `go.sh` verifies `require('better-sqlite3')` actually loads.
- **`better-sqlite3` must stay on v13 or newer.** v11 shipped ABI-specific
  prebuilds, so a Node version newer than the release had none and npm fell back
  to compiling from source — which needs Visual Studio on Windows and Xcode tools
  on macOS. This cost an hour on Node 24: `prebuild-install` 404'd on
  `node-v137-win32-x64`, then `node-gyp` failed with "Could not find any Visual
  Studio installation". v13 moved to N-API, so one binary per platform covers
  every Node version and nothing compiles. Do not pin it back.
- **Google Fonts are unreachable in some sandboxes.** The UI uses native system
  font stacks deliberately. Do not add a webfont link.
- **Background servers die between tool calls** in sandboxed shells. Use
  `setsid ... < /dev/null &` and allow a real warm-up before curling.
- **A truncated WebM still decodes** up to the truncation point. This is desirable:
  it is what makes partial-recording recovery work. Do not "fix" it.
- **`next build` runs the migrations.** It imports `db.ts` while collecting page
  data, so it opens whatever `DB_PATH` points at. Build with the test database in
  `DB_PATH` when testing, as `npm run test:e2e` does.
- **Never test against `data/`.** It is the clinic's real database. Test accounts
  created there would become the clinic's accounts. To click around, use
  `npm run dev:sandbox` (setup code `sandbox`), never `npm run dev`, whose `.env`
  points at `data/`.
- **Every function in `db.ts` is async, and a missing `await` still compiles.**
  `recordAudit(...)` without `await` type-checks, and online the request can end
  before it runs. Also `await x().y` awaits `y`, not `x()`: write `(await x()).y`.
- **Paths written by hand need `appPath()`.** Online the app lives under `/app`.
  Next.js prefixes `<Link>`, `redirect()` and `router.push`; it cannot see
  `fetch("/api/…")`, `<a href>` or `window.location` — nor a path passed through a
  helper first, which is how the People screen shipped broken on 17 Sep 2026.
  `npm run check:paths` (run first by both test commands) catches it; the suites
  call the API directly and cannot.
- **Middleware redirects must be absolute URLs** — Next.js throws "Invalid URL" on a
  relative `Location`. Build them on `x-forwarded-host`, as `middleware.ts` does:
  behind the website the request's own host is the app project's address, where the
  visitor has no cookie. (Vercel then sends it on as a relative path.)
- **The website's `headers()` must skip `/app`.** Its `Permissions-Policy:
  microphone=()` would reach the app through the rewrite and stop recording.
- **The root `.vercelignore` applies to Git deployments of both projects**, not only
  CLI uploads. Excluding `/clinicos-app` whole made the app build from an empty
  folder. Exclude the places patient data and keys live, by name.
- **Local Postgres tests share one connection.** PGlite multiplexes every client over
  one session and, under a burst, can hand one client's statement another's
  parameters. `test:e2e:pg` sets `PG_POOL_MAX=1`, so its race tests prove correctness,
  not concurrency; those are real only against Supabase (`TEST_DATABASE_URL`).
- **postgres.js fails a whole transaction on any failed statement, even a caught one.**
  Catching the error and running `ROLLBACK TO SAVEPOINT` by hand is not enough: `begin`
  still rejects at the end. Use `savepoint()` from `sql.ts`, which uses the driver's own.
- **`next build` collects pages in parallel workers, each running the SQLite migrations.**
  Every statement in `openSqlite()` must be safe to run twice at once: `IF NOT EXISTS`,
  `ON CONFLICT DO NOTHING`, and updates that match nothing the second time.
- **Tombstone ids include the clinic** (`<clinicId>:<table>:<rowId>`). Without it, one
  clinic's computer could record a deletion under another clinic's row id and stand in
  the way of that clinic's real deletion reaching its computers.

---

## State of the work

Built and tested:

- The full consultation flow: record → transcribe → draft → sign → print (the clinic
  accepts ClinicOS's terms once; there is no consent step per visit since 20 Sep 2026)
- Patient records, history, search, type-to-confirm deletion
- **Backlog #1 — crash and offline recovery.** Audio streams to disk in 5-second
  chunks; the note autosaves to both the server and localStorage; unfinished
  consultations surface on the Today page with the reason they stopped.
- **Backlog #2 — backup and restore.** Daily automatic snapshot triggered lazily on
  page load, 14 kept, one-tap download, restore behind a typed `RESTORE`
  confirmation that snapshots the current database first.

- **Backlog #37 — the public website.** `landing/`, deployed on Vercel from `main`
  with Root Directory `landing`. It holds no patient data and cannot reach the
  clinical app. Enquiries go to a Tally contact form; every address the site uses
  lives in `landing/src/site.ts`. Public copy is Varaxis-branded and international
  (clinics of any size up to hospitals). The Krishnanagar field site stays in
  internal docs and pilots, not on the site.
- **v0.5 Part A — accounts, roles, permissions, and the activity log (backlog #4).**
  In `main`. Verified by `npm run test:e2e`: the permission matrix over HTTP against
  a seeded prototype-era database (every existing record unchanged), plus the
  reset-password script and restoring a pre-accounts backup.
- **v0.5 Part B — role dashboards, the day's list (backlog #5), search by phone (#8).**
  Front desk Today is the desk (find, register, list); doctor Today has "Waiting
  now" with Start visit; admin sees signed consultations per doctor as raw counts.
- **The doctor's speed features (18 Sep 2026, branch `workflow-speed`):** a visit
  written by hand without recording (#18), the last visit shown and its medicines
  repeated in one tap (#17), favourites (#15, #16), Ctrl+K search from anywhere
  (#19), and the speed pass (#3): step times on Clinic admin, transcription starting
  when recording stops. Verified by `scripts/test/workflow-test.cjs` on both databases.
- **ClinicOS as a service (19 Sep 2026, branch `saas`):** many clinics in one online
  database, each with its own address `/c/<slug>`, setup code and accounts; the Varaxis
  platform console; pausing a clinic. Verified by `tenancy-test.cjs`.
- **Clinic computer sync (19 Sep 2026, branch `saas`):** a clinic's own computer keeps a
  full copy in step with its clinic online, where the plan includes it. Verified by
  `sync-test.cjs`, which runs two clinic computers beside the online copy.
- **v0.5 Part C, the patient portal (19 Sep 2026, branch `saas`):** inside the online app
  at `/p`. Verified by `portal-test.cjs`. Since 20 Sep 2026 the patient chooses English,
  Bengali or Hindi and agrees to the portal's terms once at first sign-in; the doctor
  shares in one tap.
- **Prescription extras (19 Sep 2026, branch `saas`):** the clinic's logo (#25), "come back
  at once if…" in the doctor's own words (#20, `returnIf` — never filled by the AI), and
  the medicine timing card in English, Bengali or Hindi (#9, `rx-card.ts` — re-reads what
  the doctor wrote, never guesses). Verified by `rx-test.cjs`.
- **Billing and follow-up recall (20 Sep 2026, branch `saas`):** bills, payment by cash,
  UPI, card or other, printed receipts, cancelling (#12); a date to come back on the note,
  printed on the prescription, and the desk's Follow-ups list with a WhatsApp reminder
  through `wa.me` (#10). Verified by `billing-test.cjs`, and in the permission, tenancy
  and sync suites.

Every item in the order Ishaan asked for ("all one by one") is now built on `saas`; what
waits on Ishaan is in CONTEXT.md §7, starting with merging `saas` into `main`. The full
plan is in CONTEXT.md §6. Backlog numbered 1–37 across tiers 0–7.

**Online since 17 Sep 2026** (Ishaan's decision, reversing "not hosted"): the same
app at vxclinicos.vercel.app/app, on Postgres, as a prototype for made-up patients.
Since 19 Sep 2026 it is being built into the product: a service clinics buy.

**Not built and deliberately so:** standalone desktop packaging, online payment
collection (Varaxis records what each clinic bought; invoicing stays in its own
paperwork until there are clinics paying), any AI beyond transcription and note
drafting.

---

## Tooling

**Tests.** `cd clinicos-app && npm run test:e2e` seeds a prototype-era database in
`clinicos-app/.test-data/`, builds the app against it, starts it on port 3100 and runs
the suites in `scripts/test/` over real HTTP: upgrade safety and the permission
matrix, the day's list, the doctor's speed features, the recovery tools, many clinics
in one database, and clinic computer sync. Run it after any change to the clinic app,
and add checks when you add routes — to `tenancy-test.cjs` too, with another clinic's
ids. Don't run it while `npm run dev` is running in the same folder — both use `.next/`.
Add `-- --no-build` to reuse a build.

`npm run test:e2e:pg` runs the same suites on Postgres the way the online copy runs —
built under `/app`, with the setup code and clinic time zone — against PGlite, so
nothing needs installing. For the sync suite it also starts two more copies of the same
build on SQLite (ports 3101 and 3102) as clinic computers. Two more targets, both refusing to start unless the clinic
tables are empty and emptying them afterwards:

- `TEST_DATABASE_URL=<Supabase pooler>` builds locally against the real database, for
  true concurrency.
- add `TEST_BASE_URL=https://vxclinicos-app.vercel.app/app TEST_SETUP_CODE=<code>` to
  test the deployed app itself; nothing is built.

Never point either at a database holding real records.

`.mcp.json` at the repo root configures MCP servers for any agent session opened
here. None of them are required to build or run the app — delete the file and
nothing breaks.

| Server | What it is for |
|---|---|
| `context7` | current docs for a named library. Use it before writing against Motion, GSAP, R3F or Next 15 APIs — training data on all four is stale and confidently wrong. Set `CONTEXT7_API_KEY` for higher limits; it works without one. |
| `chrome-devtools` | open the running app, read the console, trace network and performance. The honest way to check whether an animation actually holds 60fps. |
| `playwright` | drive and screenshot the app. Useful for confirming a UI change looks right rather than asserting that it does. |
| `shadcn` | pull real component source. **Note:** this app has no Tailwind and no shadcn — it uses a hand-written design system in `globals.css`. The server is configured but inert unless that changes. |
| `sequential-thinking` | structured reasoning for multi-step changes. |

### Skills

`.claude/skills/clinicos-motion/` — the animation and 3D system. Read it before
touching any transition, scroll effect or 3D scene. Its core rule: clinical
surfaces get functional motion under 200ms and no 3D; expressive motion and WebGL
belong only on marketing surfaces, behind `next/dynamic` with `ssr: false`.

### Animation dependencies

**The clinic app has none, deliberately** (20 Sep 2026). `motion`, `gsap`, `lenis`,
`three`, `@react-three/fiber` and `@react-three/drei` were removed with the
`motion-lab` smoke test that was the only thing importing them: nothing clinical may
use 3D, and they were 177 MB of `node_modules` on every clinic computer and every
build. The website (`landing/`) keeps `motion`, `gsap` and `lenis` for its own
surfaces. Add an animation library to `clinicos-app` only with a reason, and read
`.claude/skills/clinicos-motion/` first.

`globals.css` now carries motion tokens (`--dur-1/2/3`, `--ease-out`, `--ease-in`)
and a global `prefers-reduced-motion` guard. The guard is a requirement, not a
nicety: this is health software and motion sickness in a clinic is not cosmetic.
The recording dot and waveform degrade to a static visible state rather than
freezing mid-animation, because their meaning is carried by movement.

---

## The gate that matters

**Zero of the twenty doctor discovery interviews have been done.**

`docs/ClinicOS_Launch_Plan.md` sets kill criteria that were written before any
testing, and they have not been run:

| When | Threshold | If it fails |
|---|---|---|
| Week 4 | ≥ 6 of 20 doctors name documentation unprompted in their top-3 frustrations | the problem is not the one we think |
| Week 8 | ≥ 2 of 3 pilot clinics still using it unattended on day 21 | it is endured, not adopted |
| Week 16 | ≥ 5 clinics paying | the model does not hold |
| Ongoing | 0 consultations lost | nothing else matters |

The backlog is roughly a year of part-time work. Building further features before
those interviews is the main risk to this project. **If asked what to do next, say
the interviews** — and only then talk about features.

---

## House style

- Plain language in the UI. This is read by a doctor mid-consultation, not by a
  developer. "Nothing here has been lost" beats "recovery state detected".
- Anything irreversible requires typing something to confirm — a patient's name,
  the word `RESTORE`. Apply this pattern to any new destructive action.
- Comments explain *why*, especially where a subtle constraint drove the code.
- Never brand deterministic rule-based behaviour as "AI".
- Be honest in numbers shown to doctors. Time-saved is computed at a deliberately
  conservative 4 minutes per note; a figure a doctor disbelieves costs more than a
  smaller one they accept.
