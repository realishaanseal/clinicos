# ClinicOS

A consultation-documentation assistant by Varaxis for clinics and medical
institutions of every size — from the single-doctor practice to multi-doctor clinics,
hospitals and health systems — built to scale internationally.

In a busy outpatient consultation the doctor has a few minutes per patient — about
two in India. In that time they must greet, take a history, examine, explain,
prescribe and record, and the record is what gets dropped. ClinicOS records the
consultation that was already happening, transcribes it, drafts a structured clinical
note, and asks the doctor only to review and sign. A branded prescription prints from
the signed note, and the audio is deleted the moment the note is signed.

---

## Where it is going

The plan from the start has been one product that grows with the institution using it:

| Stage | Who it serves | What it adds |
|---|---|---|
| **1. Clinics** | Single-doctor and small practices | The consultation flow, records, front desk, billing, follow-up, prescriptions |
| **2. Larger institutions** | Multi-doctor clinics, polyclinics, hospital outpatient departments, health systems | Many doctors and roles, many clinics in one account, a clinic's own computer kept in step with its online copy, audit trails, export |
| **3. International** | Healthcare providers outside India | Languages, data residency and the regulatory requirements of each market |

Stage 1 and the foundations of stage 2 are built. What decides the pace is the doctor
and institution interviews in `docs/ClinicOS_Launch_Plan.md`, across practice sizes.

## Two ways to run it

One codebase, chosen by environment variables:

- **On the institution's own computer** (SQLite): no cloud and no internet needed.
  Speech recognition and note drafting run locally.
- **Online, as a service** (PostgreSQL): many clinics in one database, each seeing only
  its own records, with an optional paid add-on that keeps a clinic's own computer in
  step with its online copy. The online copy is currently a prototype for made-up
  patients only.

## Quick start (on your own computer)

Requires Node.js, Python 3, and [Ollama](https://ollama.com) installed.

```bash
ollama pull qwen2.5:7b-instruct

cd clinicos-app
cp .env.example .env
./go.sh            # macOS; on Windows: powershell -ExecutionPolicy Bypass -File .\go.ps1
```

`go.sh` installs what is missing and starts all three processes:

| Process | Port | Purpose |
|---|---|---|
| Next.js app | 3000 | the interface and API |
| faster-whisper sidecar | 8756 | speech to text, locally |
| Ollama | 11434 | note drafting, locally |

Open http://localhost:3000 and create the owner account on `/setup` straight away. To
click around without touching real data, use `npm run dev:sandbox` instead.

## Layout

```
clinicos-app/   the application (Next.js 15, React 19, TypeScript, SQLite or PostgreSQL)
landing/        the public website
docs/           launch plan, feature backlog, consent scripts, pilot agreement,
                problem statement
artifacts/      decks, reports, trackers, briefs
CLAUDE.md       working context — architecture, invariants, known traps
CONTEXT.md      what is built, what is decided, what comes next
```

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · SQLite through `better-sqlite3` or
PostgreSQL through `postgres`, with hand-written SQL and no ORM · faster-whisper for
speech recognition · Ollama running `qwen2.5:7b-instruct` for note drafting.

Speech recognition and note drafting both sit behind small provider interfaces, so a
hosted service can replace the local one through settings alone.

## Design commitments

- **No clinical judgement.** No diagnoses, no risk scores. The system carries the
  record; it does not judge it. This keeps the software outside medical-device
  regulation and is a deliberate boundary, not a limitation.
- **Data stays where the institution chose to keep it.** No telemetry, and one
  clinic's records are never visible to another.
- **Audio is deleted at signing**, and patient audio is never used for training.
- **Never lose a consultation.** Audio is written to disk continuously, and work in
  progress is saved in two independent places.
- **No lock-in.** Complete records export in an open format at any time.

## Data and privacy

On a clinic computer, patient data lives in `clinicos-app/data/` and is excluded from
version control. Consultation content is sensitive personal data under India's Digital
Personal Data Protection Act, 2023, and under equivalent laws elsewhere. Never commit a
database, its WAL files, backups or any audio.

## Status

The consultation flow, accounts and roles, the front desk, billing, follow-up, the
patient portal, the online service and clinic-computer sync are built and covered by
end-to-end tests (`npm run test:e2e`, `npm run test:e2e:pg`). Field validation has not
started — see the kill criteria in `docs/ClinicOS_Launch_Plan.md`.
