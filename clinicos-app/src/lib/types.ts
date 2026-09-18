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
  };
}

/** True if anything at all has been written. An empty note must never be signed. */
export function noteHasContent(n: ClinicalNote): boolean {
  return (
    [n.chiefComplaint, n.history, n.examination, n.diagnosis, n.advice, n.followUp].some((s) => s.trim()) ||
    n.medications.some((m) => m.name.trim()) ||
    n.investigations.some((s) => s.trim())
  );
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
