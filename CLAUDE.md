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

Everything runs on the clinic's own laptop, with no cloud and no internet required.
Since v0.5, people sign in with accounts that also live only on that laptop.

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
2. **Identifiable data never leaves the machine.** No cloud sync of patient data,
   no telemetry containing consultation content, no exceptions "just for testing".
3. **Audio is deleted when the doctor signs.** Promised aloud to the patient in the
   consent script, and enforced in `signConsult()`. Do not add audio retention.
4. **Never train on patient audio.** Settled decision. Pilot Agreement clause 8
   permits de-identified data only, with an opt-out.
5. **Consent is enforced server-side.** The recording endpoints return 403 when
   `consentGiven` is false. A UI-only gate is not acceptable.
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

## Architecture

Next.js 15 App Router, React 19, TypeScript. SQLite via `better-sqlite3` with
hand-written SQL. **There is no ORM.** Prisma was removed early — its engine
downloads were blocked — and it is not coming back.

```
clinicos-app/
  src/lib/
    db.ts            all storage. schema, migrations, every query. no ORM.
    auth.ts          passwords (scrypt), sessions, requireUser / requireApiUser, roles
    session-cookie.ts  cookie name + idle limit shared with middleware (no Node imports)
    users.ts         role labels and account validation, safe for client components
    backup.ts        snapshot / restore / retention
    asr.ts           speech-to-text provider interface (local | http)
    llm.ts           note generation provider interface (ollama | openai)
                     SYSTEM_PROMPT lives here — the clinical safety text
    types.ts         ClinicalNote shape and parseNote()
    clinic.ts        clinic identity: Setting table first, .env as fallback
    useRecorder.ts   streams 5-second audio chunks to disk while recording
    useAutosave.ts   debounced server save + localStorage mirror
    useQueue.ts      polls today's list every 5 seconds while the tab is visible
  src/middleware.ts       redirects to /login when there is no session cookie (only)
  src/components/
    ConsultWorkflow.tsx   the 4-step consultation UI
    Prescription.tsx      printable A4 prescription
    FrontDeskToday.tsx    the front desk's Today: find, register, today's list
    WaitingPanel.tsx      the doctor's "Waiting now" and Start visit
    BackupPanel.tsx       clinic admin: backup, restore, export
    DeletePatient.tsx     type-the-name-to-confirm deletion
    UsersAdmin.tsx        clinic admin: add people, manage access, reset passwords
  src/app/setup, login    first-run owner account; sign-in
  src/app/admin/          clinic details, people, activity log, backups, deletion
  src/app/api/            route handlers — every one starts with requireApiUser()
  scripts/reset-password.mjs   npm run reset-password -- <username>, at the laptop
  scripts/test/           npm run test:e2e — see Tooling
  asr/server.py           FastAPI + faster-whisper sidecar
  go.sh                   setup and launch
landing/                  public website. static Next.js, no database, no API
                          routes, no access to clinicos-app. see landing/README.md
docs/                     launch plan, backlog, consent script, agreements
artifacts/                decks, trackers, briefs
```

**Provider abstraction:** ASR and LLM both sit behind small interfaces so a hosted
endpoint can replace the local one through env vars alone. Keep it that way — do
not call Ollama or Whisper directly from a component or route.

**Schema migrations:** SQLite has no `ADD COLUMN IF NOT EXISTS`. `db.ts` reads
`PRAGMA table_info` and conditionally runs `ALTER TABLE`. Safe to re-run. Existing
pilot databases must survive upgrades — never drop and recreate a table.

Tables: `Patient`, `Consult`, `Edit`, and since v0.5 `User`, `Session`, `AuditEvent`,
`Setting`, `QueueEntry`.

**Accounts and permissions (v0.5).** The first run opens `/setup`, which creates the
owner account and then refuses forever. Every page calls `requireUser()` and every
route handler calls `requireApiUser()` with the capability it needs — hiding a link
is never the control:

| Capability | doctor | staff | admin |
|---|---|---|---|
| `clinical` — transcripts, notes, signing, prescriptions, patient history | yes | no | no |
| `frontdesk` — register and find patients, today's list, record consent | yes | yes | no |
| `admin` — people, clinic details, backups, export, deletion, activity log | if `isAdmin` | no | yes |

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
  created there would become the clinic's accounts.

---

## State of the work

Built and tested:

- The full consultation flow: consent → record → transcribe → draft → sign → print
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

Next, in order: v0.5 Part C (patient portal: a doctor shares a signed visit with the
patient's consent), Part D (invariant 2, consent script and website copy updated
to match). The full plan is in CONTEXT.md §6. Then #3 speed pass. Backlog numbered
1–37 across tiers 0–7.

**Not built and deliberately so:** hosting or deploying the clinical app,
standalone desktop packaging, multi-clinic accounts, any AI beyond transcription
and note drafting.

---

## Tooling

**Tests.** `cd clinicos-app && npm run test:e2e` seeds a prototype-era database in
`clinicos-app/.test-data/`, builds the app against it, starts it on port 3100 and runs
the suites in `scripts/test/` over real HTTP: upgrade safety and the permission
matrix, the day's list, and the recovery tools. Run it after any change to the
clinic app, and add checks when you add routes. Don't run it while `npm run dev` is
running in the same folder — both use `.next/`. Add `-- --no-build` to reuse a build.

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

`motion` (successor to Framer Motion), `gsap`, `lenis`, `three`,
`@react-three/fiber`, `@react-three/drei`. `src/app/motion-lab/` is a development
smoke test proving they are wired correctly — it is not a product surface and is
safe to delete.

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
