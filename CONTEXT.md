# ClinicOS — project context

> **For any AI assistant or developer continuing this work.** Read this first, then
> [CLAUDE.md](CLAUDE.md) for the rules that must not be broken, the architecture and
> the house style. CLAUDE.md holds what is stable; this file holds what moves: what is
> built, what is live, what has been decided, and what comes next.
>
> **Keep it current.** When you finish something, update §3, §6, §7 and §10.
>
> Last updated: 15 September 2026.

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
| `clinicos-app/` | The clinical app (Next.js 15 + SQLite). Runs only on the clinic computer. |
| `landing/` | The public website (static Next.js), deployed to Vercel. See `landing/README.md`. |
| `docs/` | Launch plan, 37-item backlog, problem statement, discovery script, consent script, pilot agreement, website brief. |
| `artifacts/` | Decks, the 61-section startup blueprint (.docx), trackers, briefs, prototype documentation PDF. |
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

## 3. Current state (15 September 2026)

### Live

- **Website:** https://clinicos-varaxis.vercel.app
  - Vercel project `demo`, team `Varaxis`, Hobby plan, Root Directory `landing`.
  - Production deploys from `main`.
  - The first address, `demo-ten-tau-97.vercel.app`, still works.
  - Sections: hero, problem, how it works, where the data lives, what is built,
    product tour, who it is for, current status, get in touch. Also `/privacy`, a 404
    page, generated icons and a share image.
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

### Built, and deliberately not deployed

The clinic app runs on the clinic computer. Start it with `clinicos-app/go.ps1` on
Windows or `go.sh` on macOS.

- **Consultation flow** (prototype):
  - consent → record → transcribe (faster-whisper) → draft (Ollama, qwen2.5:7b) → review → sign → print
  - crash recovery, a daily automatic backup, restore behind typed `RESTORE`, full export
- **v1 Part A — accounts and permissions:**
  - `/setup` creates the owner on first run, then refuses forever.
  - Three roles — doctor, front desk, clinic admin — enforced server-side on every page
    and route.
  - People admin with temporary passwords, deactivation and resets.
  - An activity log.
  - Clinic details edited in the app.
  - `npm run reset-password -- <username>` for a locked-out owner.
- **v1 Part B — dashboards:**
  - Front desk Today: find by name or phone, register onto today's numbered list, and a
    live list.
  - Doctor Today: a "Waiting now" panel with **Start visit**. Signing marks the patient
    seen.
  - Clinic admin: signed consultations per doctor over 7 days, as raw counts.

### Not built yet

- **v1 Part C:** the patient portal (§6).
- **v1 Part D:** the rules, consent script and website copy, updated for sharing (§6).

### How to verify

- **Clinic app:** `cd clinicos-app && npm run test:e2e`
  - Builds the app and runs it on port 3100 against a throwaway seeded database in
    `clinicos-app/.test-data/` (git-ignored). It never uses `data/`.
  - Suites:
    - upgrade safety and the full permission matrix (100 checks)
    - the day's list and phone search (39)
    - reset script and restoring a pre-accounts backup (14)
  - All passed on 14 September 2026.
  - Don't run it while `npm run dev` is running in that folder.
- **Website:** `cd landing && npm run build`
  - Rebuilding the film needs the two AI tools, which are not in the repo; the
    download names and the command are in `landing/README.md` ("Rebuilding it").

---

## 4. Decisions already made — do not ask again

| When | Decision | Why, or the detail |
|---|---|---|
| 13 Sep 2026 | Public positioning: Varaxis, international, clinics of every size up to hospitals. | No Krishnanagar and no founder name on anything public. |
| 13 Sep 2026 | The website uses a free `vercel.app` address. | `clinicos-varaxis.vercel.app`. A domain can be added later without rebuilding. |
| 13 Sep 2026 | The website has no pilot offer; it ends with "Get in touch". | Ishaan wants the product, not pilots. Contact goes through the Tally form and email. |
| 13 Sep 2026 | Build the v1 product now, before the doctor interviews. | Zero of 20 interviews done. The risk stays recorded in CLAUDE.md's "gate". |
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
clinic admin pastes it into Clinic admin → Portal. There is no portal admin screen in v1.

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

### After v1

CLAUDE.md's gate still stands: the 20 interviews. The next backlog item is #3, the
speed pass.

---

## 7. Waiting on Ishaan

1. **Supabase:** create an account and a project in **Mumbai (ap-south-1)**, then copy
   the pooler connection string. Needed to start Part C.
2. **Vercel:** create a project from this repo with Root Directory `portal`, and add the
   domain `clinicos-portal.vercel.app`. Paste in the environment variables. The
   assistant generates the random keys; it does not type keys into dashboards.
3. **Before real patients use the portal:** Supabase Pro ($25/month). Vercel Pro too,
   because the Hobby plan is for non-commercial use, and that applies to the website as
   well.
4. **Optional:** delete the merged branches (`v1`, `website-contact`, `website-v1`,
   `site`, `website-glass-backdrop`, `website-smooth-film`) and the worktree
   `.claude/worktrees/website-glass`.
5. **Optional:** if Varaxis has a brand typeface file, add it and the lockup can use it.
   Until then it uses the system display face.

The Vercel connector available to assistants cannot see the `Varaxis` team. Project
settings and deploy logs have to be checked in the Vercel dashboard, or the connector
re-authorised for that team.

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
  brings a static build, which is what `landing/scripts/backdrop.py` uses.
- **Other tools' config** sits untracked in the main checkout: `.agents/` and `.codex/`.
  They are not part of the repo; leave them out of commits.

---

## 9. Known loose ends

- **Missing favicon:** the clinic app has none, so there is a harmless 404 in the browser
  console.
- **Delete list limit:** Clinic admin's delete list shows only the 50 most recent
  patients, the `searchPatients` limit.
- **Setup is open until the first account exists.** Anyone who reaches the app before
  then could claim it, so run setup as soon as a clinic install starts.
- **Promises on the website's privacy page:** no cookies, no analytics, no third-party
  scripts, and contact-form responses deleted within 12 months of last contact. Keep
  all of these true. (The backdrop frames and tables are served from the site itself.)
- **Duplicate PDF:** on the development laptop, an untracked
  `ClinicOS_Prototype_Documentation.pdf` sits at the repo root. It is identical to
  `artifacts/ClinicOS_Prototype_Documentation.pdf`.

---

## 10. History

- **9 Sep 2026:** local-first prototype committed.
- **10 Sep 2026:** demo landing site; prototype documentation PDF.
- **13 Sep 2026:**
  - The website became the real one: pilot section, Tally form, privacy page, icons,
    share image, security headers, `clinicos-varaxis.vercel.app`.
  - The pilot offer was replaced with "Get in touch".
  - The v1 plan was approved.
  - v1 Part A (accounts, roles, permissions, activity log) and Part B (role dashboards,
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
