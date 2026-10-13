# ClinicOS — From Deck to Company

**A 16-week launch plan for a part-time student founder with near-zero capital**

Prepared August 2026 · revised October 2026

---

## Where this goes

ClinicOS is planned as one product that grows with the institution using it: single-doctor
and small clinics first, then multi-doctor clinics, hospitals and health systems, and finally
an internationally scalable product. The sixteen weeks below are the first rung — proving the
consultation flow where it is easiest to put in front of a doctor — not the ceiling.

---

## The constraint that shapes everything

You are part-time and you have almost no money. That is not a disadvantage to work around — it dictates the correct strategy, and the correct strategy happens to be the one most funded founders get wrong.

Two consequences:

1. **Your scarcest resource is doctor conversations, not code.** You already have a working prototype. Every additional feature you build before talking to twenty doctors is a guess with your own time as the stake. The bottleneck is not the product.
2. **Do not buy structure until structure is forced on you.** Incorporation, a website, a logo, a company bank account — none of these get you a single doctor. They cost money you don't have and time you can't spare.

The whole plan below is built to spend nothing and learn fast, in that order.

---

## Do not incorporate yet

A pre-revenue Private Limited company in India costs roughly **₹40,000–70,000 in year one** and ₹61,000–2,31,000 a year to maintain once running (ROC filings, statutory audit, GST, ITR, bookkeeping). An LLP is cheaper (₹36,000–1,21,000) but is a poor structure if you ever raise equity.

Nothing in the next four months requires a company. Incorporate when one of these **triggers** fires, not before:

| Trigger | Why it forces the issue |
|---|---|
| A clinic wants to pay against a proper invoice | Individuals can invoice, but a clinic that wants a GST invoice needs an entity |
| You are applying for SISFS or any government grant | Requires DPIIT recognition, which requires an incorporated entity |
| You are taking money from anyone — angel, family, incubator | Equity in an unincorporated venture doesn't exist |
| You are signing a pharma or hospital partner | They will not contract with a person |
| You are applying to NVIDIA Inception / AWS Activate | Requires an incorporated company with a working website |

**When the trigger fires, choose Private Limited**, not OPC or LLP. OPC cannot cleanly take equity investors and converts awkwardly; LLP is structurally hostile to VC. Pvt Ltd is more expensive to run and it is the only one that doesn't need unwinding later.

**Timing trap worth knowing now:** SISFS requires the startup to be **within two years of incorporation**. If you incorporate today and spend eighteen months validating, you arrive at the grant application with most of your eligibility window burned. Incorporate when you have something to show, not when you have an idea.

---

## Phase 0 — Weeks 1–4: Twenty conversations, no selling

**Goal:** find out whether documentation is actually the pain for doctors — from a solo practice running a ₹500 OPD to a hospital outpatient department.

This is the single most important phase in the plan, and it is the one you will be most tempted to skip because it feels like it isn't progress. It is the only phase that can save you two years.

**What to do**

- Twenty doctors across practice sizes: solo practitioners, multi-doctor clinics and hospital outpatient departments. Face-to-face, not a form.
- **Do not open your laptop for the first fifteen minutes.** The moment you demo, the conversation becomes about your product and you stop learning anything.
- Use the attached discovery script. It is deliberately non-leading.

**What you are listening for**

- Does anyone mention paperwork, records, or writing *without you raising it*?
- What actually happens after the last patient leaves? Is there an evening of catch-up, or does the doctor go home?
- Have they ever paid for clinic software? What happened to it? (The answer is usually "we stopped using it" — find out why. That reason will happen to you too.)
- How does a returning patient's history get retrieved today? If the answer is "the patient brings a file," ask what happens when they don't.

**Getting the meetings — the genuinely hard part**

- Start with your own family's doctor. Ask each doctor at the end for two introductions to colleagues. Chain referral is the only method that scales here.
- Go at the hours medical representatives go — early morning before OPD, or the dead hour after lunch. Reps have already trained doctors to give a stranger five minutes in those windows.
- Your local **IMA (Indian Medical Association) branch** holds meetings. One introduction there is worth ten cold visits.
- Being a student is an asset in this conversation, not a liability. "I'm building something and I need to understand your day before I build the wrong thing" gets doors opened that a salesperson's pitch does not. Use it honestly.

**Cost:** ₹0. **Time:** ~12 hrs/week.

**Kill / pivot criterion:** if fewer than **6 of 20** doctors name documentation unprompted as a top-three frustration, the wedge as written is wrong. That does not kill ClinicOS. Watch for what they *do* name — if several mention that patients don't come back, or that they want the clinic to look more professional, then your printable letterhead prescription is the product and time-saving was never the story. That is a pivot, and it is a cheap one to make in week 4.

---

## Phase 1 — Weeks 3–8: Three clinics, free, real patients

Your deck says 5–10 pilot clinics. **Do three.** You are part-time, and the real workload of a pilot is not deployment — it is the phone ringing at 11am on a Tuesday when you are in class. Three clinics you support properly beat ten you abandon.

**The only metric that matters**

> On day 21, is the doctor still using it when you are not in the room?

Everything else — accuracy scores, consults logged, enthusiasm in meetings — is noise around this one question. Doctors are polite. They will tell you it's wonderful and quietly stop opening it. Instrument the product so you can see usage per clinic per day without asking. **Silent churn is invisible unless you measure it.**

**Three things to build into the pilot from day one**

1. **Consult volume logging** per clinic per day. Non-negotiable. This is your churn detector.
2. **Cost per consultation** — your actual ASR + LLM spend per visit. If a ten-minute Bengali-English consult costs more than about ₹3 to process, you have a gross margin problem at ₹2,000/month and you need to know that in week 4, not year two. This number also decides whether the free tier in your deck is survivable.
3. **An edit log.** The doctor corrects every note before signing. Capture every edit. It is simultaneously your accuracy metric, your training data, and the most persuasive artefact you can show an investor or a clinical advisor — "here is the edit rate falling over eight weeks" is a real graph.

**Consent is not optional.** Use the attached patient consent script, in Bengali, before the first recording. Get the clinic to sign the pilot agreement, which includes the data processing terms. This costs you nothing and protects everything.

---

## Phase 2 — Weeks 9–16: Make someone pay

**Charge ₹500 a month.** Not ₹2,000.

The purpose of this phase is not revenue. It is to find out whether money changes hands *at all*. A clinic that pays ₹500 has crossed a categorical line that a clinic saying "yes I would pay ₹2,000" has not. Price discovery comes later; the existence of willingness to pay comes now.

**Target: 5 paying clinics by week 16.**

That single fact is worth more to an investor, an incubator, or a clinical advisor than the 100-doctor survey in your deck — and it costs less to obtain. **Replace the survey as your headline milestone.** Stated willingness to pay is unreliable everywhere and especially so when the person asking is a student the doctor wants to encourage.

Collect by UPI until you incorporate. Keep clean records — this is taxable income and you want the paper trail intact when you do form the company.

---

## Phase 3 — Months 5–8: Structure and non-dilutive money

Only reach this phase if Phase 2 cleared. If it didn't, the answer is not a grant.

**Step 1 — Incorporate.** Private Limited. Budget ₹40,000–70,000 for year one all-in.

**Step 2 — DPIIT Startup India recognition.** Free, no government fee. Needs incorporation certificate, entity PAN, and a business description (your deck qualifies). Processed in roughly 2–10 working days on the NSWS portal. Unlocks: the Section 80-IAC tax holiday (separate IMB application), angel tax exemption, 80% patent fee rebate, and — the one that matters — SISFS eligibility.

**Step 3 — Startup India Seed Fund Scheme (SISFS).** Non-dilutive or near-non-dilutive money, and the single best fit for your situation.

- Up to **₹20 lakh as a grant** for proof-of-concept, prototype and product testing
- Up to **₹50 lakh** for commercialisation, structured as convertible instruments or debt-linked support
- Requires DPIIT recognition, incorporation within the last two years, prior funding under ₹10 crore
- **Applied through an empanelled incubator, not directly** — choosing the right incubator is most of the work
- Milestone-linked disbursement; typically 6–12 weeks from submission
- Healthcare is a stated preference sector

**Step 4 — Free infrastructure.** Once incorporated with a live website:

- **NVIDIA Inception** — free, rolling admission, no revenue requirement, explicitly welcomes bootstrapped startups. Effectively criteria-based rather than competitive. Unlocks partner cloud credits and GPU discounts. Must present as an AI product company, not a services firm.
- **AWS Activate / Google for Startups** — cloud credits that can carry your inference costs through the whole pilot period.

Verify current terms directly on each program's own site before applying; these change.

**Step 5 — West Bengal, on your doorstep.** Register with the state government to access Startup Bengal incentives (state-level registration is a precondition for all of them). More usefully: the state funds universities to set up **Entrepreneurship Development Centres**, up to ₹10 lakh in setup support plus annual activity funding. **Check whether your own institution has one or plans to.** It is the cheapest incubation you will ever access and it is walking distance away.

---

## The compliance you actually need

Your deck has no compliance slide. Add one — not because regulators are coming for a three-clinic pilot, but because the first serious investor or hospital partner will ask, and having an answer is a cheap credibility win.

**Your legal role.** When you process patient data on behalf of a clinic, the clinic is the Data Fiduciary and **you are the Data Processor**. This is a good position to be in — but it requires a **Data Processing Agreement** with each clinic covering security obligations, sub-processor transparency, and breach cooperation. That is a page of text, and it is folded into the attached pilot agreement.

**Consent, specifically for recording.** Under the DPDP framework, consent must be free, specific, informed, unambiguous and revocable, with a clear affirmative action and **no pre-ticked boxes**. Notices must state what is collected — audio recordings are explicitly named — the purpose, who receives it, retention period, and how to withdraw. The notice must be presented *before* the consultation begins. Use the attached script.

**Timelines and exposure.** Breach notification to the Data Protection Board is expected within roughly 72 hours, and CERT-In's separate six-hour cyber incident window applies alongside it. Penalties run up to ₹250 crore for failing to implement reasonable security. Full DPDP enforcement lands around **May 2027**, so you have runway — but build consent capture and audit logging *now*, because retrofitting consent onto records you already hold is genuinely painful.

**Retention.** Clinical Establishments rules mandate multi-year retention of medical records. Note this when you write your privacy policy: it is a lawful basis for declining an erasure request, and you want it documented.

### The regulatory point your deck gets half-right

Your deck says "no regulatory approval." That is **true today and false at Phase 3**, and it is worth knowing which is which.

CDSCO's guidance on medical device software excludes software "limited to data transfer, storage, archival, formatting, communication or similar functions." Your AI scribe and patient timeline — Phases 1 and 2 of your roadmap — sit outside medical device regulation on that basis. Good.

But the exclusions are **function-specific, not product-specific**. The moment your chronic monitoring layer quantifies physiological parameters for clinical decision-making and fires risk alerts, it very likely becomes regulated Software as a Medical Device, classified A–D by how critical the information is and how serious the healthcare situation. That means a licensing pathway, technical documentation, and for higher classes clinical evaluation.

Nothing here blocks you. But it means Phase 3 of your roadmap carries a regulatory cost and timeline that Phases 1 and 2 do not, and your deck currently implies otherwise. Say so on the slide — knowing where the line falls is a much stronger signal than claiming there is no line.

---

## What to change in the deck now

| Slide | Change |
|---|---|
| 1 — Title | The 10x claim is contradicted by your own 35–45% figure (eliminating all documentation gives ~1.8x). Show the arithmetic or soften it. |
| 6 — Competition | Eka Care announced an offline-capable, code-mixing-aware multilingual scribe with NVIDIA in Feb 2026, aimed at remote clinics. "No monitoring, no referral loop" describes a roadmap, not a moat. |
| 7 — Defensibility | Reframe. The moat isn't bundling four layers — funded teams can bundle. It's that you go door-to-door in districts where they will never send a salesperson. Also state plainly that the first 200 clinics get zero network value, so Phase 1 must win standalone. |
| 8 — Revenue | 500 monitored patients per clinic is the weakest number in the deck. Show a sensitivity: what SOM looks like at 30 patients/clinic and at ₹1,500/month. |
| New | Compliance slide: processor role, consent flow, retention, where the CDSCO line falls. |
| New | Unit economics: cost per consultation, gross margin per clinic, whether the free tier survives. |
| 12 — Ask | Replace "100 completed surveys" with "5 clinics paying ₹500/month." Add the amount you're raising and use of funds if you are actually raising. |

---

## Kill criteria

Write these down before you start and honour them. Deciding in advance is the only protection against sunk cost.

- **Week 4** — fewer than 6 of 20 doctors name documentation unprompted as a top-three frustration → the wedge is wrong. Follow what they *did* name.
- **Week 8** — fewer than 2 of 3 pilots still using it unattended on day 21 → the product isn't ready, and no amount of selling fixes that.
- **Week 16** — zero clinics willing to pay ₹500/month → the business isn't there in this form.

Failing one of these is not failure. Continuing past one is.

---

## Your time budget

Assume ~15 hours a week. Allocate:

- **8 hours — field.** Doctor visits, pilot support, phone calls.
- **5 hours — product.** Fixing what pilots break. Not new features.
- **2 hours — admin.** Notes, tracker, applications.

Your instinct will be to invert this, because building is comfortable and knocking on a doctor's door at 8am is not. Resist it. You have a working prototype and zero customers; the deficit is not on the product side.

---

## Week-by-week at a glance

| Weeks | Focus | Output |
|---|---|---|
| 1–2 | First 8 discovery conversations | Notes; 2 introductions per doctor |
| 3–4 | Remaining 12 conversations; first pilot clinic live | Week-4 kill criterion assessed |
| 5–6 | Pilots 2 and 3 live; consent + agreements signed | Consult volume and cost-per-consult instrumented |
| 7–8 | Day-21 retention check on pilot 1 | Week-8 kill criterion assessed; edit-rate curve |
| 9–12 | Convert pilots to ₹500/month; recruit clinical advisor | First rupee received |
| 13–16 | Reach 5 paying clinics; approach IMA and EDC | Week-16 criterion; incubator conversations begin |
| 17+ | Incorporate → DPIIT → identify empanelled incubator → SISFS | Grant application in flight |

---

## The one hire you cannot skip

Your deck already says this and it is right: the practising doctor. Not for credibility with investors — for the fact that the first doctor who spots a wrong note will tell every colleague in the district, and in a district-density strategy that is fatal. Recruit the clinical advisor during Phase 1, not Phase 3. Equity, not salary. The twenty discovery conversations are also your recruiting funnel for this person — one of those twenty is your advisor.

---

## Sources

- [DPIIT Startup India recognition — eligibility, cost, benefits](https://www.bhavyasharmaandassociates.com/dpiit-startup-india-recognition-2026-guide/)
- [Startup India Seed Fund Scheme — amounts, eligibility, application route](https://www.pedalstart.com/blog/startup-india-seed-fund-scheme-complete-application-guide)
- [West Bengal startup policy incentives](https://www.startupbengal.in/content/incentives)
- [Annual compliance costs — Pvt Ltd vs LLP vs OPC](https://www.incorpx.io/blog/annual-compliance-cost-startups-2026)
- [Health data under the DPDP Act — practical obligations](https://amlegals.com/health-data-and-the-dpdp-act-a-practical-guide/)
- [DPDP enforcement timeline](https://thelogicalindian.com/dpdp-act-enforced-from-may-20-121067/)
- [CDSCO medical device software guidance — scope and exclusions](https://natlawreview.com/article/code-compliance-decoding-indias-medical-device-software-guidance)
- [NVIDIA Inception — eligibility and benefits](https://radgrants.com/programs/nvidia-inception)
- [Eka Care × NVIDIA offline multilingual scribe](https://cxotoday.com/media-coverage/eka-care-builds-indias-first-offline-capable-unified-medical-scribe-model-using-nvidia-ai/)
- [Indian small-clinic EMR pricing benchmarks](https://medhive.in/blog/cost-of-emr-in-india)

*Scheme terms, amounts and deadlines change. Verify each on its official portal before applying.*
