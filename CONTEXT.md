# ClinicOS — project context

> **For any AI assistant or developer continuing this work.** Read this first, then
> [CLAUDE.md](CLAUDE.md) for the rules that must not be broken, the architecture and
> the house style. CLAUDE.md holds what is stable; this file holds what moves: what is
> built, what is live, what has been decided, and what comes next.
>
> **Keep it current.** When you finish something, update §3, §6, §7 and §10.
>
> Last updated: 20 September 2026.

---

## 1. The project in brief

ClinicOS records the consultation that is already happening and transcribes it. It
drafts the clinical note on the clinic's own computer, and the doctor only reviews and
signs. A branded prescription prints from the signed note.

- **Owner:** Ishaan Seal, a part-time student founder with a near-zero budget. Keep
  every recommendation cheap in time and money.
- **Company:** Varaxis.

It is framed differently for different audiences:

| Audience | Framing |
|---|---|
| **Public** (website, anything a buyer sees) | A Varaxis product for clinics of every size, up to hospitals, internationally. Never mention Krishnanagar, and never name the founder. |
| **Internal** (docs, pilots, planning) | Field site Krishnanagar, Nadia, West Bengal. Single-doctor clinics first. |

---

## 2. Repository map

| Path | What it is |
|---|---|
| `clinicos-app/` | The clinical app (Next.js 15). SQLite on a clinic computer; Postgres online at vxclinicos.vercel.app/app. `migrations/pg/` is its Postgres schema. |
| `landing/` | The public website (static Next.js), deployed to Vercel. See `landing/README.md`. Passes `/app` through to the clinic app. Rebuilt 26 Sep 2026: the app's own design tokens, no animation library, no client components. |
| `archive/landing-film/` | The website before that rebuild, kept whole and runnable as an asset — the scroll-scrubbed film, its 21 MB of frame packs and `scripts/backdrop.py`. `/archive` is in `.vercelignore`, so no deploy uploads it. |
| `docs/` | Launch plan, 37-item backlog, problem statement, discovery script, consent script, pilot agreement, website brief. |
| `artifacts/` | Decks, the 61-section startup blueprint (.docx), trackers, briefs, prototype documentation PDF, and the design-thinking report (.docx and .pdf, Oct 2026) with screenshots of the prototype. |
| `brand/` | Varaxis's official logo, light and dark. The source of truth — see `brand/README.md`. Nothing reads it yet. |
| `CLAUDE.md` | Invariants, architecture, gotchas, house style — for every assistant. |
| `CONTEXT.md` | This file. |
| `AGENTS.md` | A pointer here, for assistants that look for that filename. |
| `.claude/skills/clinicos-motion/` | Animation rules. Read before touching any motion. |
| `.claude/launch.json` | Preview configs: `landing` on :3001, `clinic` on :3000. |
| `.mcp.json` | Optional MCP servers for agent sessions. |

**Branches.** `main` holds everything that is live, and Vercel deploys the public
website from it. `v1`, `website-contact`, `website-v1`, `site`,
`website-glass-backdrop` and `website-smooth-film` are already merged into `main`;
they are history and can be deleted. Start new work on a fresh feature branch off
`main`.

---

## 3. Current state (20 September 2026)

### Live

- **Website:** https://vxclinicos.vercel.app
  - Vercel project `demo`, team `Varaxis`, Hobby plan, Root Directory `landing`.
  - Production deploys from `main`, automatically: the project is linked to
    `realishaanseal/clinicos` with `main` as the production branch, and a push reaches
    production in about 5 seconds plus a ~40 s build. Other branches get Preview builds.
  - **Verified live on 17 Sep 2026** at commit `b467afc`: every page answers (404 page
    included), the security headers and the year-long backdrop cache are served, the
    scroll fix from that morning is in the served JavaScript, and robots.txt, the sitemap
    and share previews all name `vxclinicos.vercel.app`.
  - The first address, `demo-ten-tau-97.vercel.app`, still works.
  - Sections: hero, problem, how it works, where the data lives, what is built,
    product tour, who it is for, current status, get in touch. Also `/privacy`, `/terms`
    (20 Sep 2026: what ClinicOS does and does not do, what a clinic undertakes, where
    records are kept, leaving, paying — the clinic's undertakings word for word as in the
    app), a 404 page, generated icons and a share image.
  - **The backdrop is the ClinicOS film:** Ishaan's own footage of glass lenses in
    green light, scrubbed forward as the page scrolls. Wide screens get it rotated a
    quarter-turn (a crop threw away two thirds of the frame); phones get the original
    portrait frame.
  - **Smooth scrubbing (15 Sep 2026).** The first version seeked a `<video>` and
    looked like ten frames a second. Now the film is AI-upscaled (Real-ESRGAN) and
    AI-interpolated (RIFE) into 491 frames, shipped as AVIF packs and drawn on a canvas
    on every screen refresh, blending the two nearest frames. Measured in Chromium on a
    laptop's integrated graphics: 83–85 fps (the window's full refresh rate) at 1×, 2×
    and phone size, with the film redrawn on 93–100% of refreshes while scrolling. A
    device downloads 4.4–6.6 MB, and the film starts after the first 489–737 KB.
  - **Readability is built in:** for every frame and every band of the screen, the
    script records how far text must be darkened to hold 4.5:1, and the page darkens
    only where text is being read. Checked by replaying the page's logic over the
    shipped frames at 1440×900, 1100×700 and 375×812: about 59,000 line measurements,
    none below 4.5:1 (3:1 for large headings).
  - **A site header with the Varaxis ClinicOS lockup**, set like Varaxis Scholar: tile,
    "Varaxis" heavy and white, the product name lighter in its own colour (mint). The
    footer uses it too.
  - **Green palette** taken from the film; favicon, app icon and share image match.
  - How it all works: `landing/README.md`, "Design".
- **Contact form:** Tally form "Talk to ClinicOS", https://tally.so/r/QKbB8k.
  - Responses land in Ishaan's Tally account.
  - The form links back to the website's `/privacy`.
  - It asks for no patient information.
- **Public contact email:** ishaanseal@gmail.com

- **The clinic app online: https://vxclinicos.vercel.app/app** (live once `app-online`
  is merged into `main`, which puts the website's rewrite live; the app project itself
  already serves it at https://vxclinicos-app.vercel.app/app).
  - Vercel project `vxclinicos-app` (`prj_ntNPybgIgNtEVac0dz8tVurOTUG9`), team
    `Varaxis`, Root Directory `clinicos-app`, functions in `bom1`, Git-connected with
    `main` as the production branch.
  - Database: the Supabase project `clinicos-portal` in Mumbai, next to the portal's
    tables. Schema applied from `clinicos-app/migrations/pg/001_init.sql`. Empty: no
    owner has been set up yet.
  - A prototype banner on every screen asks for made-up patients only.
  - **Not working online yet: transcription and note drafting**, which need a hosted
    AI service and its key (§7). Everything else — setup, sign-in, people, the front
    desk's list, consultations, consent, recording, signing, prescriptions, export — was
    verified on the live deployment (§10).

### Built for the clinic computer

The clinic app also runs on the clinic computer, exactly as before. Start it with
`clinicos-app/go.ps1` on Windows or `go.sh` on macOS.

- **Consultation flow** (prototype):
  - consent → record → transcribe (faster-whisper) → draft (Ollama, qwen2.5:7b) → review → sign → print
  - crash recovery, a daily automatic backup, restore behind typed `RESTORE`, full export
- **v0.5 Part A — accounts and permissions:**
  - `/setup` creates the owner on first run, then refuses forever.
  - Three roles — doctor, front desk, clinic admin — enforced server-side on every page
    and route.
  - People admin with temporary passwords, deactivation and resets.
  - An activity log.
  - Clinic details edited in the app.
  - `npm run reset-password -- <username>` for a locked-out owner.
- **v0.5 Part B — dashboards:**
  - Front desk Today: find by name or phone, register onto today's numbered list, and a
    live list.
  - Doctor Today: a "Waiting now" panel with **Start visit**. Signing marks the patient
    seen.
  - Clinic admin: signed consultations per doctor over 7 days, as raw counts.
- **The doctor's speed features** (18 Sep 2026, branch `workflow-speed`, waiting for
  Ishaan's go-ahead to merge into `main` — §7):
  - **Quick visit (#18):** "Write the note without recording" on the consent step, on
    the recorder, and whenever transcription or drafting fails. It is also what a
    patient who says no to recording gets, instead of paper. Nothing is recorded; the
    consent gate is unchanged.
  - **Last visit and repeat medicines (#17):** a returning patient's visit opens with a
    one-line reminder of their last signed visit, and the note editor repeats its
    medicines in one tap.
  - **Favourites (#15, #16):** each doctor saves the plan of a note under a name and
    fills a later note from it. Plan only, the doctor's own, none shipped (§4).
  - **Search from anywhere (#19):** Ctrl+K / ⌘K, or Search in the navigation. A doctor
    opens the record; the front desk adds the patient to today's list.
  - **Speed pass (#3):** Clinic admin shows how long each step took over 7 days (the
    middle value and the longest), and transcription starts when recording stops.
  - **Fixes found on the way:** an empty note can no longer be signed; a signed visit
    refuses to be drafted or transcribed again (it could overwrite the draft it was
    signed against); the Investigations box keeps new lines; a signed note is stored
    with only the note's own fields; "Patients on this machine" says "in the online
    copy" online.
  - **Tooling:** `npm run dev:sandbox` (the app on :3002 against `.sandbox/`, setup code
    `sandbox`), and production deploys apply Postgres migrations (§4).

- **ClinicOS as a service** (19 Sep 2026, branch `saas`, built on `workflow-speed`;
  waiting for Ishaan's go-ahead to merge into `main` — §7):
  - **Many clinics, one online database.** Every record carries its clinic; every query
    is scoped to the signed-in account's clinic. Existing records belong to the first
    clinic (`first`), so the current online copy and every clinic computer upgrade
    without change.
  - **Each clinic's own address**, `vxclinicos.vercel.app/app/c/<clinic-id>`: its setup
    until the first account exists (with its own one-time setup code), its sign-in after.
    Sign-in remembers the clinic; with several clinics and none remembered, it asks.
  - **The Varaxis platform console**, `/app/platform`: operators (made with
    `npm run operator`) create a clinic with its plan and whether clinic computer sync is
    included, get its setup code, change its plan, give it its own web address, pause it.
    Counts only — it cannot open a record. A paused clinic's admins can still export.
    The list says which clinics are stuck — no account yet, no visit yet, or not yet able
    to record because nobody has accepted the terms — and reads every clinic in one query,
    so it stays one screen at a hundred clinics as it was at two.
  - **Clinic computer sync**, the paid add-on: a clinic whose plan includes it connects
    its own computer (Clinic admin → ClinicOS online, with a key made online), and the
    two keep in step every minute while ClinicOS is open. A new computer can connect at
    setup instead. Recordings never travel; signing on either copy deletes the recording
    wherever it is. Deletions travel. Works offline and catches up.
  - **Tests:** the tenancy suite tries every route with another clinic's ids, and the
    sync suite runs two clinic computers beside the online copy. Their current counts,
    with everything else, are under "How to verify" below.
  - **Tooling:** `npm run dev:sandbox:pg` runs the online service locally on PGlite, with
    a sandbox operator.
- **v0.5 Part C, the patient portal** (19 Sep 2026, branch `saas`), inside the online app
  rather than as a separate `portal/` app:
  - After signing, **Share with the patient** in one tap (no read-out since 20 Sep 2026),
    then a 10-character code printed at the foot of the prescription with the portal's
    address and a QR code. Works online, and from a clinic computer connected to its
    clinic online.
  - The patient opens `vxclinicos.vercel.app/app/p` on their phone: first a choice of
    English, বাংলা or हिन्दी, then phone number + code the first time (choosing a 6-digit
    PIN and agreeing to the portal's terms, once), phone + PIN after. The whole portal is
    in their language; the prescription stays as the doctor wrote it. Later visits shared to
    the same phone appear by themselves. They can print, remove a visit from their list,
    or delete their account (typed DELETE). Five wrong PINs lock for 15 minutes; a code
    resets the PIN.
  - The doctor can make a new code (the old one stops working) or stop sharing (gone
    even by direct address). Deleting the patient deletes what was shared.
  - Stored encrypted (AES-256-GCM), phones only as HMACs, codes only as hashes. Needs
    `PORTAL_ENCRYPTION_KEY` and `PORTAL_HMAC_KEY` on Vercel (§7).
  - 44 checks in `portal-test.cjs`, and 3 more in the sync suite for sharing from a
    clinic computer.
- **Consent, since 20 Sep 2026 (Ishaan's decision):** no consent screen for the doctor
  any more. The clinic accepts ClinicOS's terms once — a tickbox at signup, or a card in
  Clinic admin and on the recorder for clinics set up before — undertaking to tell every
  patient and record no one who says no; the server refuses to record until it has, and
  marks each recorded visit with that basis. The patient accepts the portal's terms once,
  in their own language. Terms text and versions: `clinicos-app/src/lib/terms.ts`.
- **Part D, drafted:** the consent script's lines for keeping records online are a
  **draft awaiting Ishaan** in `docs/Patient_Consent_Script_EN_BN.md`; the pilot agreement lists Vercel and Supabase
  (Mumbai) as sub-processors, with the AI service still to be named; the website says
  records can be kept on the clinic's computer, online, or both.
- **Prescription extras** (19 Sep 2026, branch `saas`, commit `d577d4f`):
  - **#25 the clinic's logo** on the letterhead: Clinic admin → Prescriptions. PNG, JPEG
    or WebP under 100 KB, checked by its bytes; SVG refused (it can carry script).
    Stored as the `clinic_logo` setting, so it travels to a clinic computer.
  - **#20 "Come back at once if…"**: a note field only the doctor writes (`returnIf` in
    `types.ts`); the AI draft never fills it (`llm.ts` blanks it), it is not counted as a
    correction, and it prints in a red box. Favourites keep it with the plan.
  - **#9 the medicine timing card**, off by default, in English, Bengali or Hindi
    (Clinic admin → Prescriptions): morning / afternoon / night with pictures, food and
    duration, under the medicines. It only re-reads what the doctor wrote
    (`src/lib/rx-card.ts`: `1-0-1`, BD, TDS, HS…); anything uncertain, like OD with no
    time of day, prints as written.
  - `rx-test.cjs` (18 checks).
- **Billing and follow-up recall** (20 Sep 2026, branch `saas`), the last items in Ishaan's
  order:
  - **Bills (#12):** a **Bills** page for everyone who takes money (doctor, front desk,
    clinic admin): find the patient, type the lines ("Consultation" starts at the clinic's
    fee, set in Clinic admin), then **Paid now** by cash, UPI, card or other, or **Pay
    later**. Collected today by method, what is still owed, bills not yet paid, and today's
    receipts. A **Bill** button on each row of the front desk's list, and **Collected
    today** on its Today; collected per day for 7 days on Clinic admin.
  - **Receipts:** half a page — clinic, receipt number, patient, lines, total, method, who
    took it. Nothing clinical. Numbers are given at payment, in the order money was taken:
    plain online (`0001`); a clinic computer's carry its own three-letter tag (`KTR-0001`).
  - **Cancelling** is Clinic admin's only, with a reason and `CANCEL` typed. The bill stays
    on record, struck through; it no longer counts as collected or owed.
  - **Follow-up date (#10):** "Come back on" in the note editor — 3 days, 1 week, 2 weeks,
    1 month, or a date. Printed on the prescription. Only the doctor sets it.
  - **Follow-ups page** (doctor and front desk): patients whose date has come (up to 60
    days back) and who have not been back or put on the day's list. **Message on
    WhatsApp** opens WhatsApp with the reminder typed in (a `wa.me` link; ClinicOS sends
    nothing), from a template in Clinic admin, English and Bengali by default. **Not
    needed** takes them off the list. The front desk's Today says when some are due.
  - Bills, payments and follow-up actions travel between a clinic computer and its clinic
    online; a payment or cancellation made on either copy is never lost.
  - `billing-test.cjs` (70 checks), plus bill and follow-up routes in the permission,
    tenancy and sync suites.
- **For whoever owns the clinic** (20 Sep 2026):
  - **The day in one message (#13)**, on Today for the desk and the doctor: seen,
    collected by method, still owed, follow-ups due tomorrow. Shown before it is sent;
    sending is a `wa.me` link someone presses. No patient is named. Clinic admin sets
    which number it goes to, or leaves it empty and WhatsApp asks which chat.
  - **What the follow-up list is worth (#11)**: the people on it times the clinic's own
    fee, with the arithmetic printed under it. Only once a fee is set, and never called a
    forecast.
  - **Getting started (#34)** on Clinic admin: what a new clinic still has to do — terms,
    its details on prescriptions, the fee, its people, the first patient, the first backup.
    It disappears once everything is done.
  - **Patients who came back (#14)** on Clinic admin: of the patients with a signed visit,
    how many have more than one. A count of what happened, not a rate ClinicOS claims.
  - **Last visit at a glance (#24)** on a patient's record, for the doctor: what it was,
    the medicines given then, the date they were asked back, and the warning signs given.
  - **Others on this phone number (#21, the cheap half)**: a household shares one number,
    so a patient's record links to the others on it. No household table, nothing to keep
    in step, and nothing claimed about who is related to whom.
  - The doctor's Today says when patients they asked back have not come.
  - **Clinic admin can find any patient** to export or delete, not only the 50 most
    recently registered — an erasure request names someone registered years ago.
  - **`/api/health`**, open on purpose and deliberately empty: whether ClinicOS is up,
    whether its database answers, and which commit is running. For an uptime check.
- **Hardening and weight** (20 Sep 2026):
  - The app sends its own headers everywhere: a content security policy that allows
    nothing off-origin, `X-Frame-Options: DENY`, `X-Robots-Tag: noindex`, and a
    permissions policy that closes the camera and location but never the microphone.
  - Lists are one query, not one per row; "export everything" reads the clinic in five
    queries; three new indexes for a patient's visits, their place on a day's list and a
    visit's corrections (`migrations/pg/009_indexes.sql`).
  - Every label points at its field; the medicines table is a labelled group.
  - A plain "this screen stopped" page and a "that page isn't here" page, instead of a
    stack trace in front of a patient.
  - Six animation libraries and the `motion-lab` smoke test that imported them are gone:
    177 MB less in `node_modules` on every clinic computer and every build.
  - Screens ask for the settings they need by name. Today and Follow-ups were loading all
    of them, which meant carrying the clinic's logo — up to 100 KB of data URL — on every
    render to read a number.

- **The AI service, settable in the app** (20 Sep 2026, Ishaan asked for it), on Clinic
  admin under **Transcription and note drafting**: whether each happens on this computer
  or at a hosted service, and for a hosted one its address, model and API key, plus the
  language spoken. **Test** sends a quarter-second of silence and a one-word question and
  says in plain words what came back — so a wrong key is found before a doctor records two
  minutes of a patient's time, not after.
  - A key is write-only: it is never sent back to the browser, the screen shows only that
    one is saved and its last four characters, and the activity log records that it
    changed, never its value.
  - Settings are `ai_`, not `clinic_`, so they never travel to a clinic computer: a clinic
    computer transcribes and drafts on itself and must not be handed a hosted key.
  - **Deliberately temporary.** The key is Varaxis's, one account serves every clinic, and
    Vercel's encrypted environment keeps it out of the database that holds patient
    records. §7 item 1 says what to delete once the environment variables are set for good.
  - Verified on both databases, plus the new routes in the permission, tenancy and sync
    suites; and end to end against a real OpenAI-compatible endpoint.

### Not built yet

- Everything in Ishaan's order of work is built. What is left is his (§7) and the
  interviews (CLAUDE.md, the gate).
- The old `portal/` folder was deleted on 20 Sep 2026: the portal lives inside the app.
  Its four unused tables are still in the online database, read and written by nothing.

### How to verify

- **Clinic app on Postgres:** `cd clinicos-app && npm run test:e2e:pg` (PGlite, nothing to
  install). Against Supabase or the deployed app: see CLAUDE.md, Tooling.
- **Clinic app:** `cd clinicos-app && npm run test:e2e`
  - Builds the app and runs it on port 3100 against a throwaway seeded database in
    `clinicos-app/.test-data/` (git-ignored). It never uses `data/`.
  - Suites, in order: upgrade safety and the permission matrix (144 checks), the day's
    list and phone search (50), the doctor's speed features (55), prescription extras
    (18), billing and follow-ups (70), reset script and restoring a pre-accounts backup
    (14), many clinics (73, Postgres only), clinic computer sync (71, Postgres only),
    the patient portal (44, Postgres only). On SQLite the last three only check that
    their online parts are absent.
  - All passed on 20 September 2026: 539 checks on Postgres (PGlite), 357 on SQLite,
    on the Windows laptop.
  - Don't run it while `npm run dev` is running in that folder.
- **Speed, as a clinic grows:** `cd clinicos-app && npm run bench` (5,000 patients,
  ~10,000 visits, in `.bench/`; nothing of it touches `data/`). On the Windows laptop on
  20 Sep 2026: Today 154 ms, Patients 50 ms, a patient's record 32 ms, Bills 33 ms,
  Follow-ups 79 ms, Clinic admin 225 ms, the whole-clinic export 800 ms for 35 MB.
- **Website:** `cd landing && npm run build`. It has no film and no animation
  library; what it does have, and the rules for extending it, are in
  `landing/README.md`.
  - The old film site still runs: `cd archive/landing-film && npm install &&
    npm run dev` on port 3002. Rebuilding the film itself needs the two AI tools,
    which are not in the repo; the download names and the command are in
    `archive/landing-film/README.md` ("Rebuilding it").

---

## 4. Decisions already made — do not ask again

| When | Decision | Why, or the detail |
|---|---|---|
| 13 Sep 2026 | Public positioning: Varaxis, international, clinics of every size up to hospitals. | No Krishnanagar and no founder name on anything public. |
| 13 Sep 2026 | The website uses a free `vercel.app` address. | `vxclinicos.vercel.app` since 17 Sep 2026, matching `vxscholar.com`. It was `clinicos-varaxis.vercel.app` until then, and that address now 404s. A real domain can be added later without rebuilding. |
| 13 Sep 2026 | The website has no pilot offer; it ends with "Get in touch". | Ishaan wants the product, not pilots. Contact goes through the Tally form and email. |
| 13 Sep 2026 | Build the v0.5 product now, before the doctor interviews. | Zero of 20 interviews done. The risk stays recorded in CLAUDE.md's "gate". |
| 13 Sep 2026 | Four logins: doctor, front desk, patient, clinic admin. | |
| 13 Sep 2026 | Full records stay on the clinic computer. Only a signed visit the doctor chooses to share goes online, with the patient's recorded consent. | This changes invariant 2. The rewrite is part of Part D. |
| 13 Sep 2026 | Transcription and note drafting stay on the clinic computer. | |
| 13 Sep 2026 | Patients sign in with a code printed on the prescription, then a PIN they set. | Free. SMS codes in India need DLT registration (about ₹5,900 + GST once) and cost ₹0.12–0.20 per sign-in. |
| 13 Sep 2026 | The portal database is Postgres on Supabase, in the Mumbai region. | Delegated to the assistant as "best for the long term". Postgres runs anywhere, so there is no lock-in. Turso was rejected (young platform for long-lived health data); Neon has no Mumbai region. |
| 13 Sep 2026 | A shared visit shows exactly the printed prescription. | Never the transcript, audio, AI draft or edit log. It matches the patient-held record direction in blueprint §28 and ABDM. |
| 13 Sep 2026 | The front desk gets a simple day's list with tokens. | |
| 14 Sep 2026 | `main` holds everything; all branches were merged into it. | So any assistant opening the repo sees the latest version without switching branch. |
| 14 Sep 2026 | The website backdrop is Ishaan's own glass film, used as the real footage. Not a WebGL, SVG or AI-generated imitation of it. | Ishaan asked for the video's look itself, not something like it. |
| 14 Sep 2026 | Varaxis product lockup: tile, "Varaxis" heavy and white, the product name lighter in its own colour. ClinicOS's colour is the film's mint. | It matches the Varaxis Scholar lockup, so the products read as one family. It uses the system display face because the site loads no webfonts. |
| 15 Sep 2026 | The film plays as AI-upscaled, AI-interpolated AVIF frames drawn on a canvas, never as a seeked video. | Seeking read as ten frames a second. Real-ESRGAN (`realesr-animevideov3`) and RIFE v4.6 were chosen by side-by-side tests against Lanczos, `realesrgan-x4plus` and ffmpeg's interpolation. Ishaan approved downloading both open-source tools; they run locally and upload nothing. No upscaler connector exists. |
| 17 Sep 2026 | The release being built — Parts A–D — is called **v0.5**, not v1. | v0.5 is the working prototype, to be tested and changed thoroughly before anything is called finished. v1 is reserved for the first real release, once v0.5 has held up in a clinic. |
| 17 Sep 2026 | **The clinic app runs online**, the same code as on the clinic computer. | Ishaan chose it after being told the cost: records and recordings in the cloud, hosted AI, and the consent script, rules and privacy copy changing. It reverses "hosting the clinical app: not built, deliberately". |
| 17 Sep 2026 | It lives at **vxclinicos.vercel.app/app**, not a second address. | Ishaan asked for the website's own address. The website rewrites `/app` to the `vxclinicos-app` project, built with `basePath: /app`. |
| 17 Sep 2026 | Online records go in the existing Supabase project in Mumbai, beside the portal's tables. | No second project to create or pay for; no table names collide. |
| 17 Sep 2026 | Until the consent script covers online use, the online copy is for made-up patients only, with a banner on every screen. | The script still promises patients that nothing leaves the clinic computer. |
| 18 Sep 2026 | Cloud now, a clinic's own computer later — with the design already built: one codebase, `DATA_BACKEND` choosing Postgres online or SQLite on the clinic computer. | Ishaan asked how medical software handles this and suggested routing web requests to a database on the clinic laptop. Advised against: the app would go down whenever that laptop or its internet did, and it puts the laptop on the internet. Most small-clinic software in India is cloud-hosted; hospitals often run their own server. (Ishaan's answer to a hosting question that day was given while the assistant's copy of the repo was two days stale; what it asked for — the same app and database design, hosted — is what already exists.) |
| 18 Sep 2026 | Order of work: the doctor's speed features, then the patient portal (Parts C and D), then prescription extras (#9, #20, #25), then billing and follow-up (#12, #10). | Ishaan: "all one by one". |
| 18 Sep 2026 | Transcription and drafting online use a hosted AI service, through the existing `http` / `openai` providers. | Ishaan chose it; still waiting on a key (§7.1). |
| 18 Sep 2026 | A note written by hand has no AI draft: no `Edit` rows at signing, and it counts in neither time saved nor edits per note. | Diffing against an empty draft logged every word typed as a "correction", and counting it as time saved would claim work ClinicOS did not do. |
| 18 Sep 2026 | Favourites are written by each doctor, hold the plan only (diagnosis, medicines, tests, advice, follow-up), are private to that doctor, and never overwrite what is already in a note. ClinicOS ships none. | A shipped "viral fever" template would be clinical advice (invariant 1); a patient's complaint or findings must never be carried to another patient. Deleting one is a two-tap confirm, not a typed one: it is the doctor's shortcut, not a record. |
| 18 Sep 2026 | Production deploys of the app apply Postgres migrations before building; Preview builds never touch the database. Migrations must be additive. | The manual step needed the database password, which lives on one laptop, and forgetting it would break pages online. Previews share the production database, so an unreviewed branch must not change it. |
| 18 Sep 2026 | Step times are shown as the middle value and the longest, with the number of visits, on Clinic admin — never an average, a score or a per-doctor ranking. | One tab left open over lunch would wreck an average. The numbers are operational, with nothing about any patient. |
| 19 Sep 2026 | **ClinicOS is sold as a cloud service (SaaS).** Many clinics in one online database, each seeing only its own records. | Ishaan: "we will ship it as a saas cloud storage product". Reverses "multi-clinic accounts: not built, deliberately". |
| 19 Sep 2026 | **A clinic's own computer can keep a full copy in step with its clinic online — a paid add-on**, switched on per clinic by Varaxis when the clinic buys it. | Ishaan: "that feature would be set for that clinic domain and product from our side during their purchase … we will charge accordingly". Invariant 2 rewritten to match. |
| 19 Sep 2026 | Each clinic's address is `/app/c/<clinic-id>` on the website's own address; a clinic's own web address can be added later (Tenant.domain). | Works on the free `vercel.app` address with no DNS. Subdomains per clinic would need a bought domain with wildcard DNS. |
| 19 Sep 2026 | Varaxis's platform console shows counts, never records; operator accounts are made from the command line only, and every operator change appears in the clinic's own log. | A SaaS provider opening clinics' records would break invariant 2 and the clinic's trust. |
| 19 Sep 2026 | Pausing a clinic (for a lapsed subscription) stops consultations and the list, but its admins can always sign in and export everything. | Invariant 8, no lock-in, holds whatever the reason for a pause. |
| 19 Sep 2026 | Plans are labels (Trial, Cloud, Cloud + clinic computer) and features are switches on each clinic. Prices and invoices stay in Varaxis's own paperwork; no payment gateway yet. | Near-zero budget, no paying clinics yet; the gate (20 interviews) still stands. |
| 19 Sep 2026 | Sync merges row by row: a signed visit stands, the AI draft is never replaced, otherwise the later change wins; deletions win; recordings never travel. Token clashes resolve the same way on both copies (first added keeps the number). | A signed note is the legal record; invariants 3 and 6. |
| 19 Sep 2026 | The online copy stays "made-up patients only" until Part D rewrites the consent script for online use; a clinic computer connecting to it must confirm its patients are made up. | The consent script still promises patients their data stays on the clinic computer. |
| 20 Sep 2026 | Everyone who takes money can bill — doctor, front desk and clinic admin — and only Clinic admin cancels, with a reason and `CANCEL` typed. Bills are never edited or deleted. | In a small clinic whoever is free takes the money. A bill carries nothing clinical, so the admin's no-clinical-access rule still holds; the admin gets billing's own patient search, not the front desk's. |
| 20 Sep 2026 | Receipt numbers are given at payment. Online they are plain; each clinic computer puts its own three-letter tag in front, made the first time it takes a payment and kept in a setting that never travels. | Replaces the design's `L-` then device-id prefix: a tag that changed at connect time would split one computer's receipts into two series, and two unconnected computers would both print `L-0001`. Consonants only, never L, so a tag spells no word. |
| 20 Sep 2026 | A cancel reason stays on the bill, never in the activity log. | It is typed freely and could name the patient; a deleted patient must not survive in the log. |
| 20 Sep 2026 | **No consent screen per visit or per share.** The clinic accepts ClinicOS's terms once (signup tickbox, or Clinic admin), undertaking to tell every patient and record no one who says no; the server refuses to record until then. The patient accepts the portal's terms once, at first sign-in, after choosing English, Bengali or Hindi. | Ishaan: "the concent thing … is not needed not like the doctor is gonna show evertime … keep this in terms and conditions as a tickbox during login or signup one time … can have a language option at the start", then "Both" (recording and sharing). A tickbox in the portal alone could not cover recording, which happens before a patient sees the portal, so the clinic's own acceptance is the basis for that. Invariant 5 rewritten. |
| 20 Sep 2026 | `main` is the SaaS web version. `saas` was fast-forwarded into it and went live the same night. | Ishaan: "ye put into main … rn we are focussing on complete saas product web version. so that will be the main". |
| 26 Sep 2026 | **The website is rebuilt light**: one sheet of warm paper on the clinic app's own design tokens, no animation library, no client components, no film. The film version is kept whole and runnable in `archive/landing-film` rather than deleted. | Ishaan: "since its a product, we would put a more premium but light landing page, instead of the device heavy animations", and "keep it as an asset". Premium now comes from restraint — type, hairlines, one teal, the product on the page — instead of 21 MB of frames and three animation libraries running on the visitor's device. The archive is excluded from both Vercel projects. |
| 20 Sep 2026 | The clinic app carries no animation libraries at all; the website keeps its own. Since 26 Sep 2026 the website has none either. | `motion-lab` was the only thing importing `motion`, `gsap`, `lenis`, `three` and the two React-three packages, and nothing clinical may use 3D. They cost 177 MB in `node_modules` on every clinic computer and every build. |
| 20 Sep 2026 | Follow-ups stay on the list for 60 days, leave it when the patient is back (a later visit, or put on the day's list) or the desk acts, and the reminder's template has only `{name}`, `{clinic}`, `{doctor}`, `{date}`. | A phone's lock screen shows the message to anyone; there is deliberately no way to put a diagnosis in it. WhatsApp through `wa.me` costs nothing and needs no account or API. |
| Prototype era | The invariants in CLAUDE.md. | No clinical judgement. Audio deleted at signing. No training on audio. Consent enforced server-side. `draftJson` immutable. Backups via the SQLite backup API. No lock-in. |

---

## 5. Working agreements with Ishaan

- **Commit and push automatically** when a change is implemented and verified, on a
  feature branch. **Ask before merging anything into `main`**, because `main` deploys
  the public website.
- Commits use the configured git identity, `ishaanseal@gmail.com`. Older commits used
  another of Ishaan's addresses; that is expected.
- Explain in plain, non-technical language. Ishaan writes briefly and informally.
- Anything that needs an account, a purchase, or keys typed into a dashboard is
  Ishaan's to do. Say exactly what to create and where.
- Respect the budget. A free option that works beats a paid one that is nicer.
- If asked what to do next, CLAUDE.md's rule still applies: say the interviews, then
  talk about features.

---

## 6. Plan for what is left (approved 13 September 2026)

### The clinic app online (decided 17 Sep 2026, built and verified on `app-online`)

Ishaan chose to put the real v0.5 app online so it can be seen and used from the
website, after being told what it costs: records and recordings in the cloud, cloud AI
for transcription and notes, and the rules, consent script and privacy copy changing.
It reverses "not built and deliberately so: hosting the clinical app" in CLAUDE.md.

**One codebase, two ways to run.** `DATA_BACKEND=sqlite` (the default) is the clinic
laptop exactly as before. `DATA_BACKEND=postgres` is the online copy on Vercel.
- `src/lib/sql.ts` is the only place that knows which database is in use. `db.ts` keeps
  every query, now `async`, written once in SQL both databases accept.
- Postgres is the existing Supabase project in Mumbai, in the `public` schema next to
  the portal's four tables (no names collide). Migrations are numbered files in
  `clinicos-app/migrations/pg/`, applied with `npm run migrate:pg`, tracked in
  `_clinic_migration`.
- Recordings: on disk locally; in an `AudioChunk` table online. Signing deletes them in
  both.
- "Today" uses `CLINIC_TIMEZONE` (`Asia/Kolkata` online). Vercel runs on UTC and does not
  allow `TZ` to be set.
- Internet hardening, online only: `/setup` needs `SETUP_CODE`; the wrong-password
  lockout is counted from the activity log instead of memory; a prototype banner says to
  use made-up patients until the consent script covers cloud processing.
- Backups online: download and restore of `.db` files do not apply; "Export everything"
  still works. Supabase's free plan keeps no backups, so this is a prototype, not a place
  for real records.
- AI online: `ASR_PROVIDER=http` and `LLM_PROVIDER=openai` against an OpenAI-compatible
  service. Needs an API key from Ishaan.
- Hosting: a second Vercel project with Root Directory `clinicos-app`, functions in
  `bom1` (Mumbai) beside the database, nothing longer than 300 s (the Hobby limit).
- Website: **Sign in** in the header and a closing sign-in section; "On your hardware.
  Nowhere else." and the privacy page reworded so they stay true.
- Tests: `npm run test:e2e` keeps running on SQLite; the same suites also run on Postgres
  locally through PGlite, so no Postgres install is needed.
- Served at vxclinicos.vercel.app/app through a rewrite on the website, the app built
  with `basePath: /app` online only.

**Left before real patients use it:** a hosted AI service for transcription and notes
(§7.1); the consent script (English and Bengali) and the pilot agreement's
sub-processors rewritten for online use — Part D's work, now needed for the online copy
as well as the portal (CLAUDE.md invariant 2 was rewritten on 19 Sep 2026 for the
service and sync, and still holds the online copy to made-up patients until then); paid
plans with backups (§7). As a service sold to clinics, also: a privacy notice and a
data-processing agreement for clinics under India's DPDP Act (the clinic decides what is
recorded; Varaxis processes it for them), and the prototype banner switched off with
`NEXT_PUBLIC_CLINICOS_PROTOTYPE=0` only once all of that is done.

### Order of work (Ishaan, 18 Sep 2026: "all one by one")

1. **The doctor's speed features** — built on `workflow-speed` (§3), waiting to merge.
1a. **ClinicOS as a service, and clinic computer sync** (Ishaan, 19 Sep 2026) — built on
   `saas` (§3), which contains `workflow-speed`; waiting to merge.
2. **The patient portal**, Part C below, with Part D — **built on `saas` (19 Sep 2026),
   inside the online app**: with sync, a clinic computer's shares go through its clinic
   online, so the separate `portal/` app and its push design were not needed. The
   design below still describes what it does, except that shares live in `PortalShare`
   in the app's own database, patients' accounts in `PortalAccount`, and there is no
   per-clinic portal key.
3. **Prescription extras:** #9 a Bengali card showing when to take each medicine, #20
   a "come back immediately if…" card (the doctor's own words, printed), #25 the
   clinic's logo on the letterhead. **Built on `saas` (19 Sep 2026, `d577d4f`), §3.**
4. **Billing and follow-up:** #12 collected, pending and a printed receipt; #10
   WhatsApp follow-up through a `wa.me` link the desk taps (no WhatsApp API, no cost).
   **Built on `saas` (20 Sep 2026), §3,** from the design below, with these changes:
   receipt numbers use a per-computer tag instead of `L-` and the device id (§4); the
   cancel route is `/api/bills/[id]/cancel`; a clinic admin bills through its own patient
   search (`/api/bills/patients`); Clinic admin's settings for the fee and the reminder
   are one card (`/api/admin/billing`). The design as it was written:

   **Billing (#12).**
   - A `Bill` table on both databases (twin in `sql.ts` and a new
     `migrations/pg/007_billing.sql`): `id, clinicId, patientId` (→ Patient, on delete
     cascade), `itemsJson` (`[{label, amount}]`, amounts in **paise**, integers only),
     `totalPaise`, `day` (the clinic's local day it was made), `receiptNo` (null until
     paid; unique per clinic when present), `paidAt, paidDay, method` (cash / UPI / card
     / other), `receivedBy`, `voidedAt, voidedBy, voidReason`, `createdBy, createdAt,
     updatedAt`, plus the sync columns and triggers every travelling table has.
   - It travels: add `Bill` to `SYNC_TABLES` after `QueueEntry`, with its `COLUMNS` and
     `Patient` as its parent in `sync.ts`, and to `tracked`/`withUpdatedAt` in
     `migrateSyncTracking()`.
   - Receipt numbers are given at payment, never at billing, as the next number per
     clinic (`MAX+1`, retried on a unique clash like `addToQueue`). So two copies can
     never hand out the same number: online numbers are plain (`0042`); a clinic
     computer prefixes its own (`L-0042` when not connected; once connected, a short tag
     from its device id, saved at connect time from `/api/sync/hello`).
   - A new capability, `billing`, for doctor, staff **and** admin roles; blocked while a
     clinic is paused, like `frontdesk`. Cancelling (voiding) a bill is `admin` only,
     needs a reason, and the word `CANCEL` typed — irreversible actions are typed.
   - Nothing clinical on a bill: the desk types the items ("Consultation", "Dressing").
     The default first line is "Consultation" at the clinic's fee, a new `clinic_fee`
     setting in Clinic admin (a `clinic_` key, so it travels).
   - Screens: a **Bills** page (`/bills`): today's collected and pending totals, a new
     bill (find patient → items → "Paid now: cash / UPI / card" or "Pay later"), unpaid
     bills, today's paid bills, each with Take payment / Print receipt / (admin) Cancel.
     A printable receipt (`/bills/[id]`): letterhead with logo, receipt number, date,
     patient's name, items, total, method, received by. A "Bill" button on each row of
     the front desk's list, and "Collected today" on its stats. Clinic admin: collected
     per day for 7 days, as plain sums.
   - Audit `bill_create`, `bill_pay`, `bill_void` — amounts and method, never a name.
   - Money helpers in a pure `src/lib/money.ts`: parse rupees to paise, format paise as
     ₹ with Indian grouping (`en-IN`).
   - Tests: a `billing-test.cjs` suite on both databases (create, pay, sequential
     numbers, staff can bill but not cancel, typed CANCEL, totals, receipt shows nothing
     clinical), bill routes in `perm-test.cjs`'s route list, and another clinic's bill
     ids in `tenancy-test.cjs`; a bill made on a clinic computer reaching online in
     `sync-test.cjs`.

   **Follow-up recall (#10).**
   - A follow-up **date** the doctor may set: a new optional note field `followUpOn`
     (`YYYY-MM-DD`) beside the follow-up text, printed on the prescription. Like
     `returnIf`, the AI never fills it (`llm.ts`), it is not a correction, and it is not
     part of a favourite's plan (it belongs to one visit).
   - Signing copies it to a new `Consult.followUpOn` column (add to `COLUMNS` for sync),
     so the list is a plain query rather than reading JSON.
   - A small travelling `Recall` table (`id, clinicId, consultId, patientId, action`
     messaged / dismissed, `at, by, updatedAt`): what the desk did about a due visit.
   - A **Follow-ups** page (frontdesk capability): signed visits whose `followUpOn` is
     today or up to 60 days past, with no later visit by that patient and no `Recall`
     action yet — name, phone, due date, and **Message on WhatsApp**: a
     `https://wa.me/91<number>?text=…` link opened in a new tab, from a template in
     Clinic admin (`clinic_recall_message`, with `{name}`, `{clinic}`, `{doctor}`,
     `{date}`; English and Bengali defaults). Tapping it records "messaged"; "Not
     needed" records "dismissed". Never a diagnosis in the message or on the page.
   - "Follow-ups due today" on the front desk's Today.
   - Tests in `billing-test.cjs` or a `recall-test.cjs`: the date prints, the AI draft
     cannot set it, due/overdue/later-visit logic, the wa.me link has the right number
     and no clinical words, staff can see the list, tenancy.

### Part C — patient portal

**Architecture:** a new `portal/` Next.js app, hosted on Vercel. Data flows one way:
the clinic app pushes to the portal over HTTPS, and the portal never calls into the
clinic. The clinic laptop never needs to be reachable from the internet.

**Hosting:**
- A Vercel project with Root Directory `portal`, at `clinicos-portal.vercel.app`
  (unclaimed on 13 Sep 2026).
- Environment variables: `DATABASE_URL`, `PORTAL_ENCRYPTION_KEY`, `PORTAL_HMAC_KEY`.

**Database:** Postgres on Supabase, Mumbai (ap-south-1).
- Plain hand-written SQL through Postgres.js (`postgres`) over Supabase's pooler.
- Connect with `prepare: false`; a transaction-mode pooler breaks prepared statements.
- No ORM, no Supabase client library, no Supabase Auth.
- Migrations are numbered `.sql` files in `portal/migrations/`, applied with
  `npm run migrate`. Queries live in `portal/src/lib/db.ts`.
- The free plan pauses after 7 days of low activity. That is fine for building; move
  to Pro ($25/month, never paused) before real patients rely on it.

**Portal tables:**
- `Clinic(id, name, keyHash)`
- `PatientAccount(id, clinicId, phoneHmac, displayName, pinHash, failedAttempts, lockedUntil, createdAt)`
- `SharedVisit(id, clinicId, accountId, phoneHmac, codeHash, payloadEnc, visitDate, sharedAt, revokedAt)`
- `PortalSession`

**Flow:**
1. After signing, the doctor presses **Share with patient**. It is offered only when a
   phone number is on record. A short spoken consent (English and Bengali) is recorded
   locally: who asked, when, and the patient's yes.
2. The share goes into a local `ShareOutbox` table. `clinicos-app/src/lib/portal.ts`
   pushes it with the clinic key as a Bearer token, on page load and on a timer. If
   offline, it stays queued and Clinic admin shows it waiting. The consultation never
   waits on the network.
3. The portal stores the visit and returns an access code. The prescription prints the
   portal address, the code and a QR code.
4. **Patient sign-in:**
   - Each shared visit prints a 10-character code, grouped for reading aloud (e.g.
     `K7QF-2MXP-9D`). Only its hash is stored.
   - First time: phone number + code, then set a 6-digit PIN.
   - After that: phone + PIN. Later visits shared to that phone appear automatically.
   - The phone must match the one on the visit.
   - Five wrong attempts lock the account for 15 minutes.
   - Any printed code resets a forgotten PIN.
5. The patient sees their visits read-only, in the prescription layout. They can print a
   visit, remove one, or delete their account.
6. The doctor can revoke a share from the patient's local record. The revoke is pushed
   the same way.

**What a shared visit contains:** exactly the signed prescription — letterhead, signing
doctor, date, diagnosis, complaint and history, examination, medicines, investigations,
advice and follow-up. It is built from `finalJson` with `parseNote` and rendered with a
copy of `Prescription.tsx`.

**Security:**
- The payload is AES-256-GCM encrypted with the server key, on top of Supabase's own
  encryption.
- Phone numbers are stored only as an HMAC.
- Sign-in attempts are counted and locked out.
- Same security headers as `landing/`; no analytics.

**Clinic onboarding:** `npm run portal:add-clinic "<name>"` prints a clinic key once. The
clinic admin pastes it into Clinic admin → Portal. There is no portal admin screen in v0.5.

**Tests to add** (extend `clinicos-app/scripts/test/`, and add a portal suite):
- share → code on the prescription → portal sign-in → visit visible → revoke → gone
- an offline share is queued, then delivered exactly once
- a wrong phone for a valid code is refused
- five wrong PINs lock the account
- a printed code resets a PIN
- a revoked visit returns 404 even by direct URL
- the `SharedVisit` payload column is ciphertext

### Part D — rules and copy (ships with Part C)

- **CLAUDE.md, invariant 2:** identifiable data never leaves the machine, except a
  signed visit the doctor explicitly shares with the patient's recorded consent.
- **Consent:** `docs/Patient_Consent_Script_EN_BN.md` and the consent panel in
  `ConsultWorkflow.tsx` gain a separate, optional consent for online sharing. Refusing
  changes nothing about care.
- **In-app notice:** `SideNav.tsx`'s "Running locally" wording is updated.
- **Website:** `landing/` privacy and "nowhere else" copy is made accurate, and the
  portal gets its own privacy page.
- **Pilot agreement:** `docs/ClinicOS_Pilot_Agreement.md` Schedule A lists Vercel and
  Supabase as sub-processors.

### After v0.5

CLAUDE.md's gate still stands: the 20 interviews. The speed pass (#3) has started:
the times are measured (§3). Cutting them further needs real consultations to measure.

---

## 7. Waiting on Ishaan

0. **Done 20 Sep 2026: `saas` is in `main` and live** at vxclinicos.vercel.app/app; the
   production build applied the migrations itself.
   **Now add the two portal keys**: run `npm run portal:keys` in `clinicos-app` and paste
   the two lines into the `vxclinicos-app` project's environment (Production, marked
   Sensitive), then redeploy. Set them once: changing them later makes what was shared
   unreadable.
   **Then make your operator account**, from `clinicos-app` on a computer with the online
   database's connection string (the one in `portal/.env.local` on the Mac):
   `DATABASE_URL="…" npm run operator -- add ishaan "Ishaan Seal"`. It prints a temporary
   password; sign in at vxclinicos.vercel.app/app/platform/login and choose your own
   (12+ characters). The existing online clinic appears there as "First clinic" with ID
   `first`: rename it and give it a proper ID from its page.
1. **Transcription and note drafting online need a hosted AI service.** Create an
   account with an OpenAI-compatible provider that offers both speech-to-text and chat
   (Groq is one with a free tier) and create an API key. Consultation audio and
   transcripts would go to that provider, possibly outside India: check its terms say it
   does not keep or train on them (invariant 4).

   **Since 20 Sep 2026 there are two ways to put the key in**, and either works:

   - **Clinic admin → Transcription and note drafting** (Ishaan asked for this on
     20 Sep 2026, as a temporary window). Switch each to "by a hosted service", paste the
     address, model and key, Save, then **Test** — it sends a quarter-second of silence
     and a one-word question and says what came back. No redeploy. The key is written to
     that clinic's `ai_` settings, never read back out, and never travels to a clinic
     computer.
   - **The `vxclinicos-app` project's environment** (Settings → Environment Variables,
     Production and Preview): `ASR_HTTP_URL`, `ASR_HTTP_KEY`, `ASR_HTTP_MODEL`,
     `LLM_OPENAI_URL`, `LLM_OPENAI_KEY`, `LLM_OPENAI_MODEL`, then redeploy. This is
     where the key belongs for good: it is Varaxis's own key, one account serves every
     clinic, and Vercel keeps it out of the database that holds patient records. Once it
     is set here, **remove the temporary window** — `src/lib/ai-settings.ts`,
     `src/app/api/admin/ai/`, `src/components/AiSettings.tsx` and the `<AiSettings />`
     line in Clinic admin — and `getAsr`/`getLlm` go back to reading the environment alone.
2. **Set up the online clinic** at https://vxclinicos.vercel.app/app with the setup code.
   The code is in `~/Desktop/Varaxis/ClinicOS-worktrees/SETUP_CODE-vxclinicos-app.txt` on
   the Mac (not in git). It only works until the first account exists.
3. **Supabase: done** on 17 Sep 2026 — organisation `Varaxis`, project `clinicos-portal`,
   South Asia (`ap-south-1`), free plan, Data API off. The schema is applied and
   `portal/.env.local` holds the transaction pooler string.
   **One thing still to do: reset the database password** in Settings → Database, and
   generate the replacement rather than choosing it. The password in use was typed into a
   chat, so it should not stay the credential for a database that will hold patient data.
   Re-encode any `@` or other special character as `%40` when pasting the new string in.
   **After resetting, the new string must also replace `DATABASE_URL` on the
   `vxclinicos-app` Vercel project** (Settings → Environment Variables, then redeploy),
   or the online app stops working.
4. **Tally form:** its link back to `/privacy` still points at
   `clinicos-varaxis.vercel.app`, which now 404s. Change it to
   `https://vxclinicos.vercel.app/privacy` in the Tally editor.
5. **Vercel:** create a project from this repo with Root Directory `portal`, and add the
   domain `clinicos-portal.vercel.app`. Paste in the environment variables. The
   assistant generates the random keys; it does not type keys into dashboards.
6. **Before real patients use the portal or the online app:** Supabase Pro ($25/month),
   which also brings daily backups (the free plan keeps none). Vercel Pro too, because
   the Hobby plan is for non-commercial use, and that applies to the website and the
   app as well.
7. **Optional:** delete the merged branches (`v1`, `website-contact`, `website-v1`,
   `site`, `website-glass-backdrop`, `website-smooth-film`, and now
   `mac-environment-notes`, `docs-compact-reference`, `fix/backdrop-scroll-performance`,
   and `verify-live-deploy` and `app-online` once merged)
   and the worktrees `.claude/worktrees/website-glass` (Windows) and
   `~/Desktop/Varaxis/ClinicOS-worktrees/app-online` (Mac).
8. **Optional:** if Varaxis has a brand typeface file, add it and the lockup can use it.
   Until then it uses the system display face.
9. **Read the Bengali follow-up reminder** (Clinic admin → Bills and follow-ups, or
   `DEFAULT_RECALL_MESSAGE` in `clinicos-app/src/lib/recall.ts`). It was written by the
   assistant; a clinic can change it, but the default should read naturally.

The Vercel **MCP connector** still cannot see the `Varaxis` team — it returns an empty team
list. The **CLI can**: it was authenticated on the Mac on 17 Sep 2026 as `realishaanseal`,
and `--scope varaxis` reaches the projects (`demo`, `vxclinicos-app`, `scholar`,
`scholar-l4ix`, `kahuproject`). Use the CLI for deploy logs and project state, not the connector.
`vercel api` reads anything the dashboard shows, e.g. the Git link with
`vercel api "/v9/projects/prj_2KpvcJHlo19NoUWLT35Otewhs3ki?teamId=team_ErYNc38VqbmpJVz0fcQ4z8dD" --scope varaxis`.

---

## 8. Environment notes

- **Machines:** the development laptop is Windows 11 (PowerShell 5.1) with an NVIDIA
  RTX 5070 Ti laptop GPU (Vulkan device 1; device 0 is the Intel integrated GPU); the
  primary field laptop is a Mac. Keep `go.sh` and `go.ps1` in step.
- **PowerShell 5.1 breaks double quotes** in arguments to native programs:
  `git commit -m "…"` (and here-strings) and `node -e "…"` both fail. Write commit
  messages to a file and use `git commit -F <file>`; put scripts in files.
- **Stop a running server before building on Windows.** A running `next start` can lock
  `.next` during `next build`.
- **Recording needs `localhost`.** Browsers block the microphone on plain-http network
  addresses, so staff devices on the clinic Wi-Fi can use everything except recording.
- **Harmless warning:** a stray `package-lock.json` in the Windows user folder makes Next
  warn about the "workspace root". It is not part of the repo.
- **The assistant's in-app browser stops painting when its window is covered.**
  Screenshots time out, `requestAnimationFrame` stops and smooth `scrollTo` never
  arrives, so a scroll-driven page looks frozen. Use the Playwright MCP instead for
  motion and performance checks.
- **Measuring with Playwright:** measure in its main page, switching screen size and
  pixel density with CDP `Emulation.setDeviceMetricsOverride`. Pages opened in extra
  browser contexts ran at about half frame rate, which looked like a performance
  problem and was not one. The Playwright MCP only reads and writes files under the
  repo root and `.playwright-mcp/`.
- **ffmpeg** is not installed on the development laptop. `pip install imageio-ffmpeg`
  brings a static build, which is what `archive/landing-film/scripts/backdrop.py` uses.
- **The Windows laptop's toolchain, 18 Sep 2026:** Node 24.19.0, npm 11.17.0. Its local
  `main` had fallen two days behind `origin/main` — the whole online copy was missing
  from it — so **`git fetch` before reading the repo**, or the picture is wrong.
- **The in-app browser's keyboard:** its `Return` key arrives with an empty key name and
  its `Escape` without a key code, so neither submits a form, adds a new line or closes a
  dialog. `Enter` works for keydown handlers; type `\n` for a new line. Clicking outside a
  dialog does close it.
- **Signing in the in-app browser:** an assistant must not type passwords into a form.
  Make a throwaway account and session in the sandbox through the API with a script,
  then set the `clinicos_session` cookie with page JavaScript. Page JavaScript cannot
  replace a cookie the server set as httpOnly, so to switch account open the same app at
  `127.0.0.1:3002` instead of `localhost:3002`: it has its own cookies.
- **Other tools' config** sits untracked in the main checkout: `.agents/` and `.codex/`.
  They are not part of the repo; leave them out of commits.
- **Never leave another project's files loose in the home folder.** Next searches
  *upward* from the app directory for a postcss config, so a `postcss.config.mjs` in
  `/Users/<user>/` is found and applied to ClinicOS. On the Mac one did: it declared
  `{ tailwindcss: {}, autoprefixer: {} }` and belonged to Varaxis Scholar, whose files had
  been unpacked straight into the home folder. Both `clinicos-app` and `landing` failed
  with `Error: Cannot find module 'tailwindcss'`. Neither app uses Tailwind, so the error
  names the wrong thing entirely — do not install Tailwind to satisfy it. Fixed on
  16 Sep 2026 by moving those files to `~/varaxis-scholar`. Putting a `postcss.config.mjs`
  in each app root would also stop the search, but an empty `plugins` list discards Next's
  built-in defaults, autoprefixer included, which matters for the public site. Same class
  of trap as the stray `package-lock.json` above, but a hard failure rather than a warning.
- **The Mac's toolchain, verified 16 Sep 2026:** Node 24.18.0, npm 11.16.0 (not npm 12, so the
  install-script gotcha in CLAUDE.md does not bite), Python 3.13.0, `better-sqlite3`
  13.0.3 loading natively with no compile. Ollama is at `/usr/local/bin/ollama` with
  `qwen2.5:7b-instruct` pulled, and the Whisper weights are already cached in
  `~/.cache/huggingface`, so the sidecar does not re-download on first run.
- **`setsid` does not exist on macOS.** Use `nohup … < /dev/null &` to keep a background
  server alive between tool calls.
- **The Vercel CLI is authenticated on the Mac** (17 Sep 2026), as `realishaanseal`, with
  the token in `~/Library/Application Support/com.vercel.cli/auth.json`. `npx vercel` will
  re-download the ~50 MB package on most runs, which takes minutes; call the cached binary
  directly instead: `$(ls -d ~/.npm/_npx/*/node_modules/.bin/vercel | head -1)`. Every
  command needs `--scope varaxis`.
- **`.vercelignore` at the repo root is a safety device, not tidiness.** A CLI deploy
  uploads the working tree, not a git commit, so without it `clinicos-app/data/` — the
  patient database — would be sent to Vercel and break invariant 2. Anything new at the top
  level that must not be published has to be added to it.
- **`vercel link` rewrites `.gitignore`.** It appends `.vercel` and `.env*` and creates a
  root `.env.local` holding a `VERCEL_OIDC_TOKEN`. `.vercel` is kept; `.env*` was removed
  on 17 Sep 2026, because it also matches `.env.example` and would silently hide every new
  example file, while `.env` and `.env.local` are already ignored. If the CLI is ever
  re-linked, take `.env*` back out.
- **The Mac's work on `app-online` happened in a git worktree** at
  `~/Desktop/Varaxis/ClinicOS-worktrees/app-online`, because another session was running
  the app from the main checkout and a build there would have broken it. Its
  `clinicos-app/.env` is a copy of the main checkout's; its `data/` is its own.
- **`vercel curl` quietly creates a protection-bypass token** on the project it reaches
  ("Generating one now…"). That is a project setting. Revoke it afterwards with
  `vercel api /v1/projects/<id>/protection-bypass -X PATCH` and a
  `{"revoke":{"secret":…,"regenerate":false}}` body; one was created and revoked on
  17 Sep 2026.
- **`vercel api … /env -X POST` with an array body silently creates nothing.** Send one
  variable per request. Mark keys and connection strings `"type":"sensitive"`.
- **Telling a Git deploy from a hand deploy:** in `vercel ls` or `vercel inspect`, a
  Git-triggered production deployment carries the alias `demo-git-main-varaxis.vercel.app`
  and has `source: git`; a CLI one has neither. Prefer letting Git deploy: it uploads the
  commit, not whatever happens to be on disk.

---

## 9. Known loose ends

- **Hand-written visits and the edit log:** before 18 Sep 2026, a note signed without an
  AI draft logged its fields as "corrections" against an empty draft. Only test data was
  affected (the online copy has no real records); older numbers may include them.
- **Setup is open until the first account exists.** Anyone who reaches the app before
  then could claim it, so run setup as soon as a clinic install starts.
- **Promises on the website's privacy page:** no cookies, no analytics, no third-party
  scripts, and contact-form responses deleted within 12 months of last contact. Keep
  all of these true. (The backdrop frames and tables are served from the site itself.)
- **Duplicate PDF:** on the development laptop, an untracked
  `ClinicOS_Prototype_Documentation.pdf` sits at the repo root. It is identical to
  `artifacts/ClinicOS_Prototype_Documentation.pdf`. On the Mac the same untracked copy
  sits in `Claude outputs/`, byte-identical to the tracked one. Harmless; delete either
  when convenient.
- **The Mac's git identity** was `ishaan.seal2007@gmail.com`, not the
  `ishaanseal@gmail.com` that §5 names. Set repo-locally on 16 Sep 2026; the machine's
  global identity is still the GitHub no-reply address, which other repos there keep.
- **The Mac's live database is still prototype-era** — `Patient`, `Consult` and `Edit`
  only, one patient and one consultation, no accounts. The first run of v0.5 code there will
  migrate it and open `/setup`. A pre-upgrade snapshot taken through the SQLite backup API
  sits at `clinicos-app/data/backups/clinicos_pre-v1-upgrade_2026-09-16.db`.
- **`clinicos-varaxis.vercel.app` is dead** and returns `DEPLOYMENT_NOT_FOUND`. The site is
  `vxclinicos.vercel.app`. The very first address, `demo-ten-tau-97.vercel.app`, still
  serves. Anything printed, sent or linked before 17 Sep 2026 points at the dead one.
- **A local clicking-around database** lives at `clinicos-app/.local-test/clinicos.db`, a
  copy of `data/` taken through the SQLite backup API and migrated to the v0.5 schema. Start
  the app against it with
  `DB_PATH=./.local-test/clinicos.db AUDIO_DIR=./.local-test/audio ./go.sh` — Next does not
  override an environment variable that is already set, so `.env` loses to those. The owner
  account created in it is `realishaanseal`, **role `admin`**, which by design sees no
  clinical screens at all; add a doctor account in People admin to test the consultation
  side.

---

## 10. History

- **9 Sep 2026:** local-first prototype committed.
- **10 Sep 2026:** demo landing site; prototype documentation PDF.
- **13 Sep 2026:**
  - The website became the real one: pilot section, Tally form, privacy page, icons,
    share image, security headers, `clinicos-varaxis.vercel.app`.
  - The pilot offer was replaced with "Get in touch".
  - The v0.5 plan was approved.
  - v0.5 Part A (accounts, roles, permissions, activity log) and Part B (role dashboards,
    the day's list, search by phone) were built.
- **14 Sep 2026:**
  - The end-to-end test suite moved into the repo (`npm run test:e2e`).
  - This file and `AGENTS.md` were added.
  - Everything was merged into `main`, which puts "Get in touch" live.
  - The website redesign was built on `website-glass-backdrop`: the ClinicOS film as
    the backdrop, the Varaxis ClinicOS lockup in a new header, a green palette.
- **15 Sep 2026:**
  - The redesign went live (`main` fast-forwarded to `0ada1ee`).
  - Ishaan reported the scroll felt like ten frames a second and asked for a higher
    quality film, then left the rest to the assistant, deploy included. The film was
    rebuilt on `website-smooth-film`: AI upscale and interpolation, AVIF frame packs,
    a canvas player with per-refresh blending, a pixel cap for high-density screens,
    and a fix for an intermittent React hydration error in `CountUp` under reduced
    motion.
- **16 Sep 2026:**
  - The Mac checkout, still on the first prototype commit and twelve behind, was
    fast-forwarded to `main`. A stale `.git/index.lock` left by a crashed git process on
    10 September had to be cleared first.
  - Both apps' dependencies were installed and the Mac environment was verified: the
    e2e suite passes in full (100 + 39 + 14 checks), `landing` builds, the ASR sidecar
    loads Whisper `small` and answers `/health`, and the clinic app serves `/setup`
    with unauthenticated API calls refused. The live `data/` database was left
    unmigrated, and every check ran against throwaway databases.
  - The home-folder postcss trap in §8 was found: Varaxis Scholar's files had been
    unpacked straight into the Mac's home folder, and its `postcss.config.mjs` broke every
    ClinicOS build and `next dev` there. Moving that project to `~/varaxis-scholar` fixed
    it; both apps then built and the whole suite passed with no workaround.
- **17 Sep 2026:**
  - The Mac environment was re-verified before any new work: Node 24.18.0, npm 11.16.0,
    Python 3.13.0, `better-sqlite3` 13.0.3 loading natively, the ASR virtualenv importing
    faster-whisper, Ollama already serving `qwen2.5:7b-instruct`, and every e2e suite
    passing with no failures. The live `data/` database was left prototype-era and
    untouched, so `/setup` has still not been run on this machine.
  - **The release in progress was renamed from v1 to v0.5** (§4), in this file, CLAUDE.md
    and the code comments that name it. On-disk names deliberately keep the old spelling —
    the snapshot `clinicos_pre-v1-upgrade_2026-09-16.db`, `scripts/test/seed-pre-v1.cjs`
    and the merged branch `v1` — because renaming a file or a branch gains nothing and
    breaks references.
  - **Part C started.** The Supabase project was created in Mumbai, and `portal/` now holds
    the database layer: the four tables from §6 in `migrations/001_init.sql`, and a
    re-runnable `npm run migrate` that records each file in `_migration` and wraps it in a
    transaction. Identifiers are quoted so Postgres keeps the capitals and both databases
    keep one vocabulary. `PORTAL_ENCRYPTION_KEY` and `PORTAL_HMAC_KEY` were generated
    straight into the git-ignored `portal/.env.local`, so they never passed through a
    screen or a chat log. The migration then ran against Mumbai: all four tables exist with
    their capitals intact, and a second run reports it is up to date rather than failing.
  - Decided: the portal uses **no Supabase client library, no Supabase Auth and no Data
    API**. The Data API is a public REST endpoint over the schema, guarded only by RLS and
    an anon key; we reach Postgres directly over the pooler and get nothing from it, so it
    stays switched off. Automatic RLS is left on as cover in case it is ever re-enabled.
  - **The website's scroll was fixed** (from the Windows laptop). It felt like about 20 fps
    despite the 83–85 fps measured on 15 Sep. The cause was `shield()`, which keeps text
    readable over the film: it recomputed on every pixel of scroll, so hundreds of
    `getBoundingClientRect()` calls a second forced layout again and again. Scroll position
    is now bucketed to 20px and `REFRESH_MS` raised from 250 to 500, which cuts the forced
    layouts while leaving the readability guarantee intact.
  - **`main` now holds everything again.** `mac-environment-notes`, `docs-compact-reference`
    and `fix/backdrop-scroll-performance` were merged into it, which puts the scroll fix
    live and adds the three-page reference PDF, the consultation flowchart and the system
    blueprint to `artifacts/`. Verified before pushing: `landing` builds clean and all three
    e2e suites pass. (Running both builds at once makes the suite fail with "database is
    locked" — `next build` runs the migrations, so build them one at a time.)
  - **The website's address changed to `vxclinicos.vercel.app`**, matching `vxscholar.com`.
    `SITE_URL` still named the old one, so robots.txt, the sitemap and every share preview
    were resolving against a host that 404s. Fixed in `landing/src/site.ts`.
  - **Vercel deploys were thought not to be triggering from GitHub** (wrong; see below).
    The site was still serving a build from before the merge, so the scroll fix was in
    `main` but not yet on the web. The Vercel CLI was authenticated on the Mac to work
    around this, and the repo was linked to the `demo` project
    (`prj_2KpvcJHlo19NoUWLT35Otewhs3ki`, org `team_ErYNc38VqbmpJVz0fcQ4z8dD`). **A
    production deploy had not been run when this session ended.**
  - **The production deploy was checked, and it was already done.** Pushing the handoff
    commit `b467afc` built production from Git at 12:35, and a hand-run CLI deploy of the
    same commit followed at 12:37; that one is what `vxclinicos.vercel.app` serves.
  - **That was a false alarm: Vercel's Git integration works.** The project is linked to
    the repo with `main` as the production branch and deployments enabled. Every push from
    15 to 17 Sep went to a feature branch, which correctly builds Previews only, so the list
    looked as if production had stalled. The first push to `main` (`93f76d0`, 11:55) reached
    production 5 seconds later, and so did the next two.
  - **A CLI deploy uploads the working tree, so what went up was checked** through Vercel's
    file listing for the live deployment: `landing/`, the root docs and `.claude/` only. No
    database, no patient data, no `.env` and nothing from `portal/`, so invariant 2 held.
    `.claude/settings.local.json` did go up; it is only an assistant's command allowlist with
    no secrets in it, and `/.claude` is now in `.vercelignore` so it stops going.
  - The site was verified live (§3). The **Tally form still links to the dead
    `clinicos-varaxis.vercel.app/privacy`**, confirmed by fetching the form (§7.4).
  - **The clinic app went online** (branch `app-online`, worked on in a git worktree).
    Ishaan asked where the v0.5 product was on the website and why only a contact page
    showed. After being told what hosting it would change, Ishaan chose to put the real app
    online, then asked for it on vxclinicos.vercel.app itself.
    - The data layer became async and database-neutral (`sql.ts`, `db.ts`), with
      Postgres races handled that SQLite's one-at-a-time transactions never allowed.
    - Recordings online are `AudioChunk` rows, deleted at signing; "today" and every time
      on screen follow `Asia/Kolkata`; `/setup` needs a code; the sign-in lockout counts
      from the activity log; a prototype banner asks for made-up patients.
    - The app is served at `/app` through a rewrite on the website, which also gained
      Sign in (header, hero, closing section) and honest wording about where data lives.
      The website's headers now skip `/app`, where `microphone=()` would have stopped
      recording.
    - The Vercel project `vxclinicos-app` was created, given its environment and
      connected to GitHub; its first Git build failed because the root `.vercelignore`
      hid `clinicos-app` from Git deployments too, which is now fixed.
    - **Verified:** 110 + 39 + 14 checks pass on SQLite, on PGlite, against Supabase with
      real concurrency, and against the deployed app itself over HTTPS, including new
      checks that a recording is stored in order and deleted at signing. Through the
      website's Preview, `/app` reached the app in Mumbai with its own headers, sign-in
      answered, and redirects named the website's host. Every test run left the database
      empty.

  - **Fixed the same day:** "Add a person" failed online with "That didn't work". The
    People screen passed its API paths through a helper, so they missed `/app` and went
    to the website. They now use `appPath()`, and `npm run check:paths` fails any test
    run where a hand-written path does not.

- **18 Sep 2026:**
  - Ishaan asked to move on to building the web version out: current features, workflow,
    and new features from the master plan, with the database in the cloud for now and on
    the clinic's own computer once there are clients. The assistant first read a local
    checkout that was two days stale and told Ishaan the database was not in the cloud;
    after `git fetch` it corrected that — the online copy on Vercel and Supabase already
    exists and is exactly this design (§4).
  - The doctor's speed features were built on `workflow-speed`, one commit each, each
    with tests: quick visit (#18), last visit and repeat medicines (#17), favourites (#15,
    #16), Ctrl+K search (#19), the speed pass (#3). Then `npm run dev:sandbox`, and
    migrations applied by production deploys. 226 checks pass on SQLite and Postgres.
    Each feature was also tried in the browser against the sandbox: a hand-written
    visit, repeating medicines, saving and using a favourite, search as a doctor and as
    the front desk, the new-line fix, and the step-times card.
- **19 Sep 2026:**
  - Ishaan: ship ClinicOS as a cloud service, with syncing to a clinic's own computer as
    an option set per clinic by Varaxis at purchase and charged for; then carry on with
    the plan. Built on branch `saas` (from `workflow-speed`), one commit each:
    - **Many clinics** (`f0aa138`): `Tenant`, `clinicId` on every record, every query in
      `db.ts` scoped by a branded `ClinicId` from the session, per-clinic addresses and
      setup codes, the platform console, pausing. A bug found on the way: a new clinic
      inherited the first clinic's `.env` address on its prescriptions; now only the
      first clinic falls back to `.env`.
    - **Clinic computer sync** (`96d8699`): triggers keep change markers on both
      databases; one merge module runs on both sides; device keys; the clinic
      computer's Clinic admin card and connect-at-setup. Two flaws found while writing
      its tests and fixed before commit: token clashes could leave the two copies with
      different numbers, and deletion records were not scoped to their clinic.
      postgres.js was found to fail a whole transaction on a caught error unless it
      happens inside its own savepoint (CLAUDE.md, gotchas).
    - CLAUDE.md's invariant 2 rewritten for the service and sync.
    - **The patient portal** (Part C), inside the app at `/p`, and Part D's texts
      drafted: the sharing consent in use, the online-records consent lines awaiting
      Ishaan, sub-processors listed, and the website's "where the data lives" copy
      updated for "your computer, online, or both".
    - **Prescription extras** (`d577d4f`): logo (#25), warning signs (#20), timing card
      (#9), checked in a browser as a printed prescription.
- **20 Sep 2026:** after a usage-limit pause, the prescription extras were committed and
  `.playwright-mcp/` (browser screenshots) was added to `.gitignore` and
  `.vercelignore`. Billing and follow-up recall were designed (§6, item 4); Ishaan asked
  for this file to be brought up to date so a new session can continue from here.
  - Ishaan: "resume from where it left off". **Billing and follow-up recall were built**
    on `saas` (§3): the `Bill` and `Recall` tables on both databases
    (`migrations/pg/007_billing.sql`), both travelling with sync; a `billing` capability;
    the Bills page, receipt, Follow-ups page, the come-back date in the note and on the
    prescription, and Clinic admin's fee, reminder and 7-day takings. A newer clinic
    computer now waits, rather than failing, on a table an older online copy does not know
    yet. 508 checks pass on Postgres and 334 on SQLite. Tried in a browser against the
    sandbox: the fee, a bill paid and one paid later, the receipt on screen and printed,
    cancelling, the come-back date, the Follow-ups list and its WhatsApp message, the desk's
    Today. Found on the way: screen-reader-only text in the front desk's list made every
    page with such a table scroll sideways on a phone (fixed in `globals.css`).
  - Ishaan: put it in `main` — the SaaS web version is the product now — and **take the
    consent screens out**: "not like the doctor is gonna show evertime", keeping consent
    as "a tickbox during login or signup one time", with "a language option at the start"
    for patients; asked which of the two consent screens, he answered **both**. So: the
    clinic accepts ClinicOS's terms once and the server refuses to record until it has;
    the patient chooses English, Bengali or Hindi on the portal's first screen and agrees
    to its terms once. `saas` was merged into `main` and went live; billing answered on
    the deployed app within minutes. 517 checks pass on Postgres, 337 on SQLite.
  - Then, unattended overnight at Ishaan's asking ("proceed with further development,
    optimisation, bug fixes, tests … work automatically"), each piece tested on both
    databases and merged into `main` only once both runs were green:
    - **Hardening and weight** (§3): the app's own headers, an icon, one query per list
      instead of one per row, three indexes, labels tied to their fields, and the
      animation libraries and `motion-lab` removed.
    - **For the owner** (§3): the day in one message (#13), what the follow-up list is
      worth (#11), Getting started (#34) and patients who came back (#14) on Clinic admin.
    - **For the doctor** (§3): a patient's record opens with the last signed visit at a
      glance (#24).
    - Plain "this screen stopped" and "that page isn't here" pages, instead of a stack
      trace in front of a patient.
    - `/api/health` for an uptime check, Clinic admin able to find any patient to export
      or delete, and a public **Terms** page on the website, in the same words the clinic
      accepts inside the app.
    - **`npm run bench`** (§3): a throwaway clinic of 5,000 patients and about 10,000
      visits, timed over HTTP, because nothing is fast because it is fast with twelve
      patients. It found Today counting the same day six times (219 ms → 154 ms) and
      Today and Follow-ups loading the clinic's logo to read a fee.
    - **Varaxis's own screen**: the console reads every clinic in one query instead of
      five per clinic, and says which are stuck — no account yet, no visit yet, or not
      yet able to record because nobody has accepted the terms.
    - **Households by phone (#21, §3)** on a patient's record, the doctor's Today saying
      when patients they asked back have not come, and the website saying what ClinicOS
      does now — bills, receipts, follow-ups and the patient's copy.
  - Where the night ended: 539 checks pass on Postgres and 357 on SQLite, the website
    builds, and production is live on the commit that is in `main` (`/app/api/health`
    answers with it).

### Recording in parts (branch `fix/recording-parts`, 24 Sep 2026) — tested, ready to merge

Nothing is merged yet; the branch is off `groq-404-model`, which is one commit off `main`.

**The bug Ishaan reported:** record, stop, delete part of the transcript, press *Record
again* — and the first part's text comes back.

**Why.** `/transcribe` read the whole recording and replaced the transcript every time, so
a re-run undid whatever the doctor had corrected or deleted. That is the reported bug, and
it reproduces exactly.

**Why `useRecorder` makes it awkward.** It starts a fresh `MediaRecorder` on every press,
so the second recording is a complete WebM stream with its own header, and `appendChunk()`
ran it onto the end of the first one. Concatenating two WebM streams is not defined
behaviour — whether a decoder reads past the second header is up to the decoder.

**Measured, 24 Sep 2026 — the second part was *not* being lost on the local path.** The
first write-up of this branch said everything after *Record again* was silently thrown
away. That was not confirmed. Two real `MediaRecorder` recordings, made in a browser and
joined exactly as `appendChunk()` joined them, decoded in full (3.12s + 2.94s → 6.06s) and
faster-whisper transcribed both sentences. Synthetic WebM muxed live, the same. So on the
clinic computer the words survived; only the doctor's edits did not. Leave the claim out
of anything shown to Ishaan.

**It is still the right fix.** Concatenation working is ffmpeg's leniency, not a
guarantee, and a hosted ASR is now in play (§7.1) whose decoder has not been tested. Parts
are independently decodable by anything, and incremental transcription is what actually
fixes the reported bug.

**The fix.** A recording is now made of *parts*, one per press of Record.

- `audio-store.ts` keeps parts apart — `<id>.webm`, `<id>.part2.webm` … on the clinic
  computer, `AudioChunk.part` online. Part 1 keeps the plain name, so existing recordings
  and `Consult.audioPath` are untouched. `audioBytes()` sums them and `removeAudio()`
  deletes every one, so the promise made at signing still holds.
- `Consult.transcribedParts` says how much of the recording the transcript already covers.
  It never syncs — neither does the recording it counts.
- `/transcribe` transcribes only the parts beyond that mark and adds their text to what the
  doctor has, which the client now sends with the request. With nothing new recorded it is
  a deliberate "do it again": every part, transcript replaced.
- `markRecordingEnded` adds each part's seconds instead of overwriting, so a visit recorded
  in two goes shows the length of both.

**Done:** `audio-store.ts`, the chunk and transcribe routes, `db.ts`, `sql.ts`,
`migrations/pg/010_recording_parts.sql`, `ConsultWorkflow.tsx`, `useRecorder.ts`, and the
multi-part checks in `perm-test.cjs`.

**Tested, 24 Sep 2026 on the Mac.** `npx tsc --noEmit` clean. `npm run test:e2e`: 363
passed, 0 failed. `npm run test:e2e:pg`: 549 passed, 0 failed. One of the branch's own new
checks was failing — it read `audioSeconds` out of a row it had not selected — and that is
fixed here, not the code it was checking.

Then a real two-part recording through `npm run dev:sandbox` with the local faster-whisper
sidecar, two separately-muxed WebM parts of actual speech:

- part one transcribed to "The patient has had a fever for three days. He also complains
  of a headache."
- the headache sentence deleted, *Record again*, part two recorded and transcribed
- the transcript came back as part one's edited text, a blank line, then "On examination
  the chest is clear and the throat is red." **Part two's words are there and the deleted
  sentence stayed deleted.**
- both parts on disk as `<id>.webm` + `<id>.part2.webm`, `audioBytes` 79363,
  `audioSeconds` 8 (5 + 3), `transcribedParts` 2
- signing deleted **both** files — invariant 3 holds across parts
- transcribing again with nothing new recorded redid the whole recording, as intended

**One thing left, and it is a decision rather than a bug.** `onStop()` in
`ConsultWorkflow.tsx` only auto-transcribes when the transcript is empty, so after *Record
again* nothing happens until the doctor presses *Transcribe*. That guard was there because
re-transcribing used to clobber corrections; it no longer does. As it stands a doctor who
records a second time and signs without pressing *Transcribe* loses part two from the
note — silently, which is the same class of failure this branch fixes. It is not a
regression (the old code behaved this way too), so it is not held against the merge, but
it is the obvious next change. Ishaan's call: it costs one line.

**Not reproduced here:** `.claude/launch.json` on this Mac has three entries — `landing`
(3001), `clinic` (3000), `clinic-sandbox` (3002) — and no `clinic-sandbox-pg`, so there is
no port clash to fix. It was an uncommitted entry on the other laptop.

**Also noticed, pre-existing and unreachable:** `POST /api/consults/[id]/audio` (a whole
file in one go) has no caller left in the UI. If it ever gets one, `writeWhole()` clears
only the parts matching the *new* extension, so a chunked `<id>.part2.webm` would outlive
an `<id>.mp4` upload and survive signing. Worth closing if that route is ever revived.

### Where to pick up

**For the next session:** `main` is the SaaS web version and is live; work continues on
branch **`saas`** and is fast-forwarded into `main` once both test runs pass (`git fetch`,
then `git checkout saas`). Every item in Ishaan's order of work is built, and so is
everything of the backlog that can be built without a hosted AI key or a storage bill:
#10–#14, #20, #21 (the phone-number half), #24, #25, #34.

**What the night of 20 September left, in order of what it cost:** billing and follow-up
recall; consent replaced by one-time terms (the clinic's, and the patient's in three
languages); a hardening and weight pass; the owner's day in one message, the list's worth,
Getting started and patients who came back; the doctor's last-visit glance and households
by phone; `/api/health`, `npm run bench`, and a public Terms page on the website. Every
piece went into `main` only after both suites passed, and production was checked after
each deploy with `/app/api/health`.

**Still unbuilt, and why:** #7 paper digitisation and #22 lab reports need a hosted vision
model (§7.1); #23 attachments needs storage nobody is paying for yet; #26–#30 are the
clinical-judgement tier (CLAUDE.md, invariant 1) and #31–#33 need several clinics in one
district. #36, an editable consent script, is superseded by the terms.

0. Ishaan: make an operator account and add the portal keys (§7.0). Until the keys are
   set, `vxclinicos.vercel.app/app/p` says "not available yet" — that is the only thing
   standing between the patient portal and a patient using it.
1. Ishaan: set up the online clinic with the setup code (§7.2), and add a hosted AI
   service so transcription and drafting work online (§7.1).
2. Ishaan: reset the Supabase password, then update `DATABASE_URL` on `vxclinicos-app`
   (§7.3); fix the Tally form's privacy link (§7.4).
3. Before real patients use the online copy: patients told their records are kept
   online (the clinic's terms or the script), the pilot agreement's sub-processors, and
   paid plans with backups (§6, §7.6).
4. Ishaan: read the Bengali follow-up reminder (§7.9).
5. Always: CLAUDE.md's gate — the 20 doctor interviews have still not been done.
