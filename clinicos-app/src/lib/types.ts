export type Medication = {
  name: string;
  dose: string;
  frequency: string;
  duration: string;
  instructions: string;
};

export type ClinicalNote = {
  chiefComplaint: string;
  history: string;
  examination: string;
  diagnosis: string;
  medications: Medication[];
  investigations: string[];
  advice: string;
  followUp: string;
  /**
   * "Come back at once if…" (backlog #20): warning signs, in the doctor's own
   * words, printed in a box on the prescription. Only ever written by the
   * doctor — the AI draft never fills it (llm.ts), because choosing warning
   * signs is clinical judgement (CLAUDE.md, invariant 1).
   */
  returnIf: string;
};

export const EMPTY_NOTE: ClinicalNote = {
  chiefComplaint: "",
  history: "",
  examination: "",
  diagnosis: "",
  medications: [],
  investigations: [],
  advice: "",
  followUp: "",
  returnIf: "",
};

export function parseNote(json: string | null | undefined): ClinicalNote {
  if (!json) return { ...EMPTY_NOTE };
  try {
    const raw = JSON.parse(json) as Partial<ClinicalNote>;
    return {
      ...EMPTY_NOTE,
      ...raw,
      medications: Array.isArray(raw.medications) ? raw.medications : [],
      investigations: Array.isArray(raw.investigations) ? raw.investigations : [],
    };
  } catch {
    return { ...EMPTY_NOTE };
  }
}

/** A note as it will be stored: only the known fields, every value a string.
 *  Whatever a browser sends is reshaped through this before it is signed, so a
 *  stray key or a number where text belongs never reaches the prescription. */
export function normalizeNote(raw: unknown): ClinicalNote {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const text = (v: unknown) => (v == null ? "" : String(v));
  const meds = Array.isArray(r.medications) ? r.medications : [];
  return {
    chiefComplaint: text(r.chiefComplaint),
    history: text(r.history),
    examination: text(r.examination),
    diagnosis: text(r.diagnosis),
    medications: meds.map((m) => {
      const o = (m && typeof m === "object" ? m : {}) as Record<string, unknown>;
      return {
        name: text(o.name),
        dose: text(o.dose),
        frequency: text(o.frequency),
        duration: text(o.duration),
        instructions: text(o.instructions),
      };
    }),
    investigations: (Array.isArray(r.investigations) ? r.investigations : []).map(text).filter((s) => s.trim()),
    advice: text(r.advice),
    followUp: text(r.followUp),
    returnIf: text(r.returnIf),
  };
}

/** True if anything at all has been written. An empty note must never be signed. */
export function noteHasContent(n: ClinicalNote): boolean {
  return (
    [n.chiefComplaint, n.history, n.examination, n.diagnosis, n.advice, n.followUp, n.returnIf].some((s) => s.trim()) ||
    n.medications.some((m) => m.name.trim()) ||
    n.investigations.some((s) => s.trim())
  );
}

/** The plan part of a note, which is all a favourite keeps: diagnosis,
 *  medicines, tests, advice, follow-up and the doctor's own warning signs. A
 *  patient's complaint, history and examination are about that patient only and
 *  are never carried to another. */
export type Plan = Pick<ClinicalNote, "diagnosis" | "medications" | "investigations" | "advice" | "followUp" | "returnIf">;

export function planOf(raw: unknown): Plan {
  const n = normalizeNote(raw);
  return {
    diagnosis: n.diagnosis.trim(),
    medications: n.medications.filter((m) => m.name.trim()),
    investigations: n.investigations.map((s) => s.trim()),
    advice: n.advice.trim(),
    followUp: n.followUp.trim(),
    returnIf: n.returnIf.trim(),
  };
}

export function planHasContent(p: Plan): boolean {
  return !!(p.diagnosis || p.advice || p.followUp || p.returnIf || p.medications.length || p.investigations.length);
}

/**
 * Fill a note from a favourite without overwriting anything already written:
 * medicines and tests are added if missing, and diagnosis, advice and
 * follow-up are filled only where empty. Returns what was added, in words.
 */
export function applyPlan(note: ClinicalNote, plan: Plan): { note: ClinicalNote; added: string[] } {
  const added: string[] = [];
  const { medications, added: meds } = mergeMedicines(note.medications, plan.medications);
  if (meds) added.push(`${meds} medicine${meds === 1 ? "" : "s"}`);

  const haveTests = new Set(note.investigations.map((s) => s.trim().toLowerCase()));
  const tests = plan.investigations.filter((s) => s && !haveTests.has(s.toLowerCase()));
  if (tests.length) added.push(`${tests.length} test${tests.length === 1 ? "" : "s"}`);

  const fill = (have: string, want: string, label: string) => {
    if (have.trim() || !want) return have;
    added.push(label);
    return want;
  };
  return {
    note: {
      ...note,
      diagnosis: fill(note.diagnosis, plan.diagnosis, "the diagnosis"),
      medications,
      investigations: [...note.investigations, ...tests],
      advice: fill(note.advice, plan.advice, "advice"),
      followUp: fill(note.followUp, plan.followUp, "follow-up"),
      returnIf: fill(note.returnIf, plan.returnIf ?? "", "warning signs"),
    },
    added,
  };
}

const medKey = (m: Medication) => m.name.trim().toLowerCase();

/** Add medicines to a list, skipping any already there by name. Used to repeat
 *  the last visit's medicines and to apply a favourite: both copy what a doctor
 *  already decided, and the doctor still reviews every line before signing. */
export function mergeMedicines(current: Medication[], extra: Medication[]): { medications: Medication[]; added: number } {
  const have = new Set(current.map(medKey).filter(Boolean));
  const fresh = extra.filter((m) => {
    const k = medKey(m);
    if (!k || have.has(k)) return false;
    have.add(k);
    return true;
  });
  // A blank row left over from "Add medication" would sit above the new ones.
  const kept = current.filter((m) => medKey(m) || m.dose || m.frequency || m.duration || m.instructions);
  return { medications: [...kept, ...fresh.map((m) => ({ ...m }))], added: fresh.length };
}

/** The fields compared with the AI draft at signing, to count corrections.
 *  Not returnIf: the AI never writes it, so the doctor writing it is not a
 *  correction of anything. */
export const NOTE_FIELDS: (keyof ClinicalNote)[] = [
  "chiefComplaint",
  "history",
  "examination",
  "diagnosis",
  "medications",
  "investigations",
  "advice",
  "followUp",
];
