# ClinicOS — local prototype

A working AI scribe for a small Indian clinic. Records a consultation, transcribes mixed Bengali/Hindi/English speech, drafts a structured clinical note and a printable prescription, and files it only when the doctor signs.

**Everything runs on your machine.** No API keys required, no cloud account, no cost. Consultation audio never touches a network — which is the only configuration in which you can honestly read the patient consent script as written.

---

## What it does

1. **Consent** — the Bengali consent script is on screen and must be confirmed before the app will accept a single byte of audio. This is enforced in the API, not just the UI (`/api/consults/[id]/audio` returns 403 without it).
2. **Record** — browser microphone, any mix of languages.
3. **Transcribe** — faster-whisper, running locally.
4. **Draft** — a local LLM writes a structured note: complaint, history, examination, diagnosis, medications, investigations, advice, follow-up.
5. **Review & sign** — the doctor corrects anything. **Every correction is logged as an edit.**
6. **On signing** — the note is filed and the raw audio is deleted from disk, exactly as promised to the patient.
7. **Timeline** — every past visit for that patient, with prior diagnoses fed to the model as context on the next visit.

### The edit log is the point

`Edit` rows record every field the doctor changed between the AI draft and the signed note. That single table is:

- your **accuracy metric** — "edits per note", shown on the home page
- your **training signal** — exactly where the model is wrong, in your languages
- your **best artefact** for a clinical advisor or an investor — an edit rate falling over eight weeks is a real graph, and almost nobody at your stage has one

Don't work around it by regenerating instead of correcting.

---

## Setup

You need **Node 20+**, **Python 3.10+**, and (for note generation) **Ollama**.

```bash
npm run setup
```

That copies `.env.example` to `.env`, installs everything, creates the database, and sets up the Python transcription service.

Then install Ollama and pull a model:

```bash
brew install ollama
ollama serve                          # leave running
ollama pull qwen2.5:7b-instruct
```

Now open three terminals:

```bash
ollama serve      # 1. note generation
npm run asr       # 2. transcription  (first run downloads the Whisper model — a few minutes, once)
npm run dev       # 3. the app → http://localhost:3000
```

Edit `.env` to set your clinic name, doctor name and registration number — they print on the prescription.

### On a MacBook Air

Whisper `small` plus a 7B model is about the right ceiling for 8–16 GB. If it's sluggish:

- `WHISPER_MODEL=base` in `.env` — noticeably faster, noticeably worse on code-mixed speech
- `LLM_OLLAMA_MODEL=qwen2.5:3b-instruct` — faster, and worse at not inventing things, which matters more here than usual

Time each step honestly. The app shows you seconds-per-transcription and seconds-per-note under each stage — those numbers go straight into the Unit Economics tab of your tracker.

---

## Swapping in cloud AI later

Both AI steps sit behind one interface each (`src/lib/asr.ts`, `src/lib/llm.ts`). Change `.env`, nothing else:

```bash
ASR_PROVIDER="http"        # any OpenAI-compatible /audio/transcriptions endpoint
LLM_PROVIDER="openai"      # any OpenAI-compatible /chat/completions endpoint
```

**Before you send a single real patient's audio to any API, check that provider's data policy in writing.** As a rule, paid API tiers of the major providers commit not to train on your inputs, while free consumer tiers often do exactly that. A provider that trains on your data makes clause 5 of your pilot agreement and the deletion promise in your consent script untrue. That is not a technicality — it is the one thing that would end you in a district-density strategy.

---

## Project layout

```
src/lib/db.ts          SQLite. One file at data/clinicos.db. No ORM.
src/lib/asr.ts         Transcription providers (local | http)
src/lib/llm.ts         Note generation providers (ollama | openai) + the clinical prompt
src/lib/types.ts       The ClinicalNote shape, shared everywhere
src/app/api/…          consent · audio · transcribe · note · sign
src/components/        ConsultWorkflow (the whole flow), Prescription (printable)
asr/server.py          Local faster-whisper service
data/clinicos.db       Your database. Copy it to back up; delete it to reset.
data/audio/            Transient. Files here are deleted at signing.
```

### The prompt is a safety surface

`SYSTEM_PROMPT` in `src/lib/llm.ts` is the most important text in this repo. It forbids inventing a symptom, dose or diagnosis, and instructs the model to leave a field empty rather than guess. When you change it, re-test with a transcript where the doctor **didn't** state a dose, and confirm the model leaves it blank. A model that helpfully fills in "500mg TDS" because that's the usual regimen is the failure mode that ends this company.

---

## Backups

```bash
cp data/clinicos.db ~/clinicos-backup-$(date +%F).db
```

Do this before every demo. SQLite is a single file; there is no excuse for losing a pilot's records.

---

## Deploying later — Cloudflare vs Firebase vs Vercel

You asked. Short answer: **Cloudflare**, and it isn't close for your situation.

**Cloudflare (Workers + D1 + R2)** — 100,000 requests/day free, no card required. The decisive point is **D1: it is SQLite**. The schema and queries in `src/lib/db.ts` port over with small changes rather than a rewrite. R2 has zero egress fees, which matters if you ever store audio. Workers AI includes Whisper models in the free allowance. The catch: `better-sqlite3` is a native module and won't run on Workers, so `db.ts` becomes the D1 client — that file is deliberately the only place that knows any SQL, so it's a contained change.

**Firebase** — the Spark free tier is real, but Cloud Functions require the Blaze pay-as-you-go plan, which needs a card on file, and pay-as-you-go with no hard cap is a genuinely bad shape for a student with no money. Firestore is also a document store, so your relational patient/consult/edit model becomes a rewrite, not a port. Skip it.

**Vercel** — the best Next.js developer experience by a distance, and the Hobby tier is generous (100 GB transfer, 1M function invocations). **But Hobby is explicitly personal, non-commercial use only.** The moment you charge a clinic ₹500, you need Pro at $20/month. Fine for the landing page; wrong for the product once money changes hands.

**One thing none of them solve for you:** data residency. Indian patient data on foreign infrastructure is a question a hospital partner or a serious investor will ask, and regional data localisation is a paid feature on every one of these. It doesn't matter for a three-clinic pilot. It matters before you scale, and it's cheaper to know that now than to migrate later.

Verify current limits on each provider's own pricing page before committing — these change.

---

## What this deliberately does not have

No login, no multi-clinic support, no ABDM integration, no chronic monitoring, no referrals. Those come after the week-8 retention gate, not before. Building them now would be building on an assumption you haven't tested yet.

---

*Sources for the hosting comparison: [Vercel Hobby limits and commercial-use policy](https://zplatform.ai/guides/is-vercel-free/) · [Cloudflare Workers free plan](https://www.srvrlss.io/provider/cloudflare/) · [Firebase Spark vs Blaze](https://unanswered.io/guide/is-firebase-free-pricing-free-tier)*
