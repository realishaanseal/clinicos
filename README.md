# ClinicOS

A local-first consultation-documentation assistant for single-doctor rural clinics
in India.

The doctor gets about two minutes per patient. ClinicOS listens to the consultation
that was already happening, transcribes it on the machine, drafts a structured
clinical note, and asks the doctor only to review and sign. A branded prescription
prints from the signed note.

Nothing leaves the laptop. No cloud, no account, no internet needed. The audio is
deleted the moment the note is signed.

---

## Quick start

Requires Node.js, Python 3, and [Ollama](https://ollama.com) installed.

```bash
ollama pull qwen2.5:7b-instruct

cd clinicos-app
cp .env.example .env          # then edit the clinic and doctor details
./go.sh
```

`go.sh` installs what is missing and starts all three processes:

| Process | Port | Purpose |
|---|---|---|
| Next.js app | 3000 | the interface and API |
| faster-whisper sidecar | 8756 | speech to text, locally |
| Ollama | 11434 | note generation, locally |

Open http://localhost:3000.

## Layout

```
clinicos-app/   the application (Next.js 15, React 19, TypeScript, SQLite)
docs/           launch plan, feature backlog, consent scripts, pilot agreement,
                problem statement
artifacts/      decks, trackers, briefs
CLAUDE.md       working context — architecture, invariants, known traps
```

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · SQLite through `better-sqlite3`
with hand-written SQL and no ORM · faster-whisper for speech recognition ·
Ollama running `qwen2.5:7b-instruct` for note drafting.

Speech recognition and note generation both sit behind small provider interfaces,
so a hosted endpoint can replace the local one through environment variables
without touching application code.

## Design commitments

- **No clinical judgement.** No diagnoses, no risk scores. The system carries the
  record; it does not judge it. This keeps the software outside medical-device
  regulation and is a deliberate boundary, not a limitation.
- **Nothing identifiable leaves the machine.**
- **Audio is deleted at signing**, as promised to the patient in the consent script.
- **Never lose a consultation.** Audio is written to disk continuously rather than
  at the end, and work in progress is saved in two independent places.
- **No lock-in.** Complete records export in an open format at any time.

## Data and privacy

Patient data lives in `clinicos-app/data/` and is excluded from version control.
Consultation content is sensitive personal data under India's Digital Personal Data
Protection Act, 2023. Do not commit the database, its WAL sidecar files, backups,
or any audio.

## Status

Working prototype. The consultation flow, patient records, crash recovery and
backup/restore are built and tested. Field validation has not started — see the
kill criteria in `docs/ClinicOS_Launch_Plan.md`.
