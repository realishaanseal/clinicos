# ClinicOS — Feature Backlog

Everything on the table, ranked by whether it earns its build cost. Pick by number.

**Effort** at ~15 hrs/week: **S** = an evening · **M** = a few days · **L** = a week or more
**Flags:** 🔴 regulatory exposure · 🟡 scope or liability trap

---

## TIER 0 — Foundation. Nothing else matters if these fail.

| # | Feature | Effort | Why |
|---|---|---|---|
| 1 | **Crash & offline recovery** — never lose an in-progress consultation | M | A doctor who loses one consultation in front of a waiting patient stops using you that afternoon. Highest-value code you can write. |
| 2 | **One-tap backup & restore** | S | "Copy this file" is not a backup strategy anyone follows. The day a clinic laptop dies decides whether you have a company. |
| 3 | **Speed pass** — measure and cut time per step | M | If transcribe + note takes longer than the next patient walking in, nothing else matters. |
| 4 | **Audit log** — who changed what, when | S | Needed before any hospital or pharma conversation. Cheap now, painful to retrofit. |

## TIER 1 — Build next. Retention and free distribution.

| # | Feature | Effort | Why |
|---|---|---|---|
| 5 | **Queue / token management** | M | Puts the *receptionist* in ClinicOS all day. Survives the weeks the doctor is too busy to record. No AI, no regulation, no patient phone. |
| 6 | **QR on prescription → patient web page** | M | Every patient who walks out carries your product. No install, no login. Solves the patient-app problem without building an app. |
| 7 | **Paper file digitisation** — photograph old prescriptions, AI attaches to timeline | L | Imports the clinic's *existing* history into you. This is the real switching cost. Also a superb first-visit demo. |
| 8 | **Search by phone number** | S | The single most-used function in any clinic system. Patients forget name spellings, never their number. |
| 9 | **Bengali medicine schedule card** — icons for morning/night/after food | S | Adherence is genuinely poor and often just illegibility. Patients show these to neighbours. |
| 10 | **WhatsApp follow-up recall** — one tap to message overdue patients | M | The action that makes the follow-up list worth anything. |

## TIER 2 — Makes them pay.

| # | Feature | Effort | Why |
|---|---|---|---|
| 11 | **Missed revenue view** — "8 patients overdue = ₹4,000 on the table" | S | Your pricing argument. Doctors discount time savings; they can verify recovered revenue themselves. |
| 12 | **Billing** — collected today, pending, printed receipt | M | Touches what clinic *owners* care about. Gives you a payer who isn't the doctor. |
| 13 | **Day-end WhatsApp summary to the owner** | S | Seen, collected, pending, tomorrow's follow-ups. Daily reason to value you. |
| 14 | **Simple analytics** — repeat rate, top conditions, revenue per day | M | Owner-facing. Also your own evidence base for the pilot. |

## TIER 3 — Speed in the consulting room. The original wedge.

| # | Feature | Effort | Why |
|---|---|---|---|
| 15 | **Templates / one-tap common cases** (viral fever, gastritis, URI) | S | Probably saves more time than transcription does on a 60-patient day. |
| 16 | **Favourite prescriptions** — the doctor's own top 20 combinations | S | Every GP prescribes the same twelve things. |
| 17 | **Carry forward chronic meds** — repeat last visit with edits | S | The most common action in a follow-up visit. |
| 18 | **Quick consult** — no-recording path for trivial cases | S | Not every patient needs the microphone. |
| 19 | **⌘K search anywhere** | S | Small, makes it feel fast and professional. |
| 20 | **Red-flag card on prescription** — "return immediately if…" in Bengali | S | Printing what the doctor already decided. Cheap safety win. |

## TIER 4 — Records depth. More switching cost.

| # | Feature | Effort | Why |
|---|---|---|---|
| 21 | **Family linking by household / phone** | M | The whole family sees one doctor in Indian practice. Culturally right, very sticky. |
| 22 | **Lab report photo → values extracted and trended** | L | High value. Defensible if you extract and display rather than interpret. |
| 23 | **Document attachments** — reports, X-rays, discharge summaries | M | The drawer the clinic currently uses. |
| 24 | **Timeline upgrades** — active conditions, current meds visible at a glance | M | What makes the second visit better than the first. |
| 25 | **Logo upload for the prescription letterhead** | S | Clinic looks like itself, not like your template. |

## TIER 5 — Chronic care. 🔴 Build carefully or not at all yet.

| # | Feature | Effort | Why / the line |
|---|---|---|---|
| 26 | **Multi-metric readings** — BP as a pair, glucose, weight, SpO2 | M | The mockup assumed one universal number and put mg/dL on cardiac patients. Fix the model before the feature. |
| 27 | **Trend display per metric** | M | Showing what the patient reported is fine. |
| 28 | **Doctor-set flags** (not automatic risk badges) 🔴 | S | "High attention" computed from a glucose value is risk stratification — the line into regulated SaMD. Let the doctor set it. |
| 29 | **"Needs attention" list** — deterministic rules, *not* branded as AI 🔴 | M | Overdue follow-up, no reading in N days, referral pending. These are database queries. Calling them AI overclaims and raises your regulatory temperature for free. |
| 30 | **WhatsApp reading submission** 🟡 | M | Instead of a patient app. Note: collecting patient-reported symptoms creates a duty to act on them. Needs a hard "not for emergencies" and a guaranteed review workflow. |

## TIER 6 — Network. Worthless until density exists.

| # | Feature | Effort | Why |
|---|---|---|---|
| 31 | **Create & track referrals** | M | Only matters once several clinics in one district are on ClinicOS. |
| 32 | **Specialist directory** | M | — |
| 33 | **Inter-clinic record sharing** | L | The actual moat, and the last thing to build. |

## TIER 7 — Product and ops.

| # | Feature | Effort | Why |
|---|---|---|---|
| 34 | **Two-minute setup wizard** | S | Every extra setup step loses clinics. |
| 35 | **Multi-user with roles** (doctor / reception) | L | Needed once #5 puts staff in the system. |
| 36 | **Editable consent script in settings** | S | Different clinics, different wording. |
| 37 | **Landing page + demo video** | M | Needed for NVIDIA Inception, grants, and doctors who Google you. |

---

## Already built

Consent gate (enforced server-side) · AI scribe · transcript editing · structured note · edit logging · printable branded prescription · patient timeline · patient list & search · settings · patient deletion with type-to-confirm · per-patient JSON export

---

## If you only do three

**#5 Queue**, **#6 QR prescription page**, **#7 paper digitisation.**

Queue gets the staff in daily. The QR turns every patient into free distribution. Digitisation makes leaving impossible. Everything else is optimisation on top of those three.

---

## The honest warning

This whole list is comfortably a year of part-time work. It is not a plan — it is a menu. Build #1 and #2 regardless, then pick from Tier 1 and stop. What you learn from three real pilot clinics should reorder everything below Tier 1, and if it doesn't, you weren't listening to them.
