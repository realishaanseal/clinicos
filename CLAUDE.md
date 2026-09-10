# ClinicOS — working context

Read this before changing anything. It exists so a session on any machine starts
with the same understanding, and so that decisions already argued through are not
quietly reversed.

---

## What this is

A local-first consultation-documentation assistant for single-doctor rural clinics
in India. Field site: Krishnanagar, Nadia, West Bengal.

The doctor gets roughly two minutes per patient. In that time they must greet,
take a history, examine, explain, prescribe **and** record. The record is what gets
dropped. ClinicOS records the consultation that was already happening, transcribes
it locally, drafts a structured clinical note, and asks the doctor only to review
and sign. A branded prescription prints from the signed note.

Everything runs on the clinic's own laptop. No cloud, no account, no internet
required.

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

Copy `.env.example` to `.env` and set the clinic identity fields. They print on
every prescription and still default to "Demo Clinic" / "Dr. Demo".

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
    backup.ts        snapshot / restore / retention
    asr.ts           speech-to-text provider interface (local | http)
    llm.ts           note generation provider interface (ollama | openai)
                     SYSTEM_PROMPT lives here — the clinical safety text
    types.ts         ClinicalNote shape and parseNote()
    clinic.ts        clinic identity read from env
    useRecorder.ts   streams 5-second audio chunks to disk while recording
    useAutosave.ts   debounced server save + localStorage mirror
  src/components/
    ConsultWorkflow.tsx   the 4-step consultation UI
    Prescription.tsx      printable A4 prescription
    BackupPanel.tsx       settings: backup, restore, export
    DeletePatient.tsx     type-the-name-to-confirm deletion
  src/app/api/            route handlers
  asr/server.py           FastAPI + faster-whisper sidecar
  go.sh                   setup and launch
docs/                     launch plan, backlog, consent script, agreements
artifacts/                decks, trackers, briefs
```

**Provider abstraction:** ASR and LLM both sit behind small interfaces so a hosted
endpoint can replace the local one through env vars alone. Keep it that way — do
not call Ollama or Whisper directly from a component or route.

**Schema migrations:** SQLite has no `ADD COLUMN IF NOT EXISTS`. `db.ts` reads
`PRAGMA table_info` and conditionally runs `ALTER TABLE`. Safe to re-run. Existing
pilot databases must survive upgrades — never drop and recreate a table.

Tables: `Patient`, `Consult`, `Edit`.

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

Next in `docs/ClinicOS_Backlog.md`: #3 speed pass, #4 audit log, #5 queue,
#8 search by phone. Numbered 1–37 across tiers 0–7.

**Not built and deliberately so:** hosting, deployment, landing page, standalone
desktop packaging, multi-doctor accounts, any AI beyond transcription and note
drafting.

---

## Tooling

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
