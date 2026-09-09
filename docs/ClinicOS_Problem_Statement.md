# Problem Statement — ClinicOS

| | |
|---|---|
| **Course** | Design Thinking · B.Tech CSE (AI & ML), Semester 1 |
| **Project** | ClinicOS — a consultation-documentation assistant for single-doctor rural clinics |
| **Field site** | Krishnanagar, Nadia district, West Bengal |

---

## 1. Context

India's rural primary care runs on very small units. As of 31 March 2023, the country had
1,69,615 sub-centres, 31,882 Primary Health Centres and 6,359 Community Health Centres,
staffed by 40,583 doctors at PHC level — roughly **1.3 doctors per PHC** (Health Dynamics of
India 2022–23, MoHFW). Alongside this public network sits a much larger, largely uncounted
layer of private single-doctor chambers: one room, one doctor, a register, and a queue.

The unit of study for this project is that last one — the **one-doctor, one-room clinic** —
because it is the setting where the largest number of Indian patients are actually seen, and
the setting almost no health software is designed for.

## 2. The observed situation

In a single-doctor clinic the doctor is simultaneously the receptionist, the diagnostician,
the pharmacist's instruction-writer and the record-keeper. Consultation time is the scarcest
resource in the room. A systematic review of 67 countries found primary-care consultation
lengths ranging from 48 seconds in Bangladesh to 22.5 minutes in Sweden, with India at
approximately **2 minutes**, and 18 countries representing about half the world's population
receiving 5 minutes or less (Irving et al., *BMJ Open*, 2017).

Two minutes must contain the greeting, the history, the examination, the explanation, the
prescription and the record. In practice the record is what gets sacrificed. What survives is
a line in a register or a carbon copy of a prescription — enough to hand the patient, not
enough to reconstruct the visit six months later.

## 3. Why the obvious fix fails

The intuitive answer — "give the clinic an electronic medical record" — has a measured
history of making the problem worse. A time-and-motion study across four specialties found
physicians spending **49.2% of office time on EHR and desk work against 27.0% on direct
clinical face time**, with a further 1–2 hours of documentation after clinic hours
(Sinsky et al., *Annals of Internal Medicine*, 2016).

Software that asks a doctor to type structured fields during a 2-minute consultation does not
return time; it takes it. Any intervention here must therefore be judged not by the richness
of the record it produces but by **whether it costs the doctor less attention than paper does.**

## 4. An assumption we had to discard

Our initial framing assumed rural clinics were offline and that connectivity was the binding
constraint. The 80th round of the National Sample Survey (Comprehensive Modular Survey on
Telecom, Jan–Mar 2025) reports **83.3% of rural households with internet access against 91.6%
urban** — a real gap, but far smaller than assumed.

The constraint is therefore not the *absence* of connectivity but its *unreliability and
consequence*: a dropped connection in the middle of a consultation, with a patient in the
chair and a queue outside, is an unrecoverable failure regardless of average national access
statistics. This reframing moved the design target from "works without internet" to
**"never loses a consultation, for any reason."**

## 5. Regulatory and ethical boundary

Two boundaries constrain the solution space rather than merely decorating it:

- **CDSCO / Software as a Medical Device.** Software confined to data transfer, storage,
  archival, formatting and communication sits outside medical-device regulation. Software
  that quantifies a physiological parameter in order to drive a clinical decision does not.
  A system that generated diagnoses or risk scores would change what the project legally is.
- **Digital Personal Data Protection Act, 2023 (and DPDP Rules, 2025).** Consultation
  content is personal data of the most sensitive kind, requiring informed consent, purpose
  limitation and deletion rights — obligations that apply to a student prototype holding real
  patient data exactly as they apply to a company.

Both push in the same direction: the system should **carry** the record, not **judge** it.

---

## 6. Problem statement

> In single-doctor rural clinics in and around Krishnanagar, a consultation lasting roughly two
> minutes must produce both care and a record, and the record is routinely the part that is
> sacrificed. Existing clinical software addresses this by asking the doctor to type structured
> data during the consultation, which measurably consumes more clinician attention than paper
> does and is consequently abandoned. The result is that clinics accumulate no usable patient
> history, follow-up is unsystematic, and a single lost register or failed device erases years
> of records — while any acceptable remedy must additionally avoid making clinical judgements
> it is not permitted to make, and must protect consultation content that is legally sensitive
> personal data.

## 7. Point of view

**Dr. Roy, a solo practitioner seeing 40–60 patients a day, needs a way to end each consultation
with a usable written record without spending consultation time producing it — because the two
minutes he has belong to the patient, and every second the record takes is taken from care.**

## 8. How might we…

1. How might we let a record write itself from what is already being said in the room?
2. How might we make the act of recording feel like *less* work than the paper it replaces?
3. How might we guarantee that no consultation is ever lost, whatever fails — tab, laptop, power or network?
4. How might we ask a patient for meaningful consent in under fifteen seconds, in their own language?
5. How might we make a clinic's history portable enough that the clinic never feels captured by us?
6. How might we stop short of clinical judgement while still being genuinely useful?

## 9. Success criteria (how we will know we were right)

| Criterion | Measure | Threshold |
|---|---|---|
| The problem is real and top-of-mind | Doctors naming documentation unprompted as a top-3 frustration in discovery interviews | ≥ 6 of 20 |
| The remedy is adopted, not endured | Pilot clinics still using the system unattended on day 21 | ≥ 2 of 3 |
| It returns attention rather than consuming it | Doctor-reported time per consultation vs. baseline | not worse |
| The record is trustworthy | Doctor edits required per generated note | trending down |
| Nothing is ever lost | Consultations lost to crash, power or network failure | 0 |

## 10. Explicit non-goals

- No diagnosis, no treatment recommendation, no risk score.
- No transmission of identifiable patient data off the clinic's machine.
- No retention of consultation audio after the doctor signs the note.
- No lock-in: the clinic's complete records must be exportable in an open format at any time.

---

### Sources

1. Ministry of Health & Family Welfare, *Health Dynamics of India (Infrastructure and Human Resources) 2022–23* — PIB release, 2024.
2. Irving G. et al., "International variations in primary care physician consultation time: a systematic review of 67 countries," *BMJ Open* 7(10), 2017.
3. Sinsky C. et al., "Allocation of Physician Time in Ambulatory Practice: A Time and Motion Study in 4 Specialties," *Annals of Internal Medicine*, 2016.
4. National Sample Survey Office, *Comprehensive Modular Survey: Telecom, 80th Round* (Jan–Mar 2025), MoSPI — as analysed by CEDA, Ashoka University.
5. The Digital Personal Data Protection Act, 2023 (No. 22 of 2023), MeitY; Digital Personal Data Protection Rules, 2025.
