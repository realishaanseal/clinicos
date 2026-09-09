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
