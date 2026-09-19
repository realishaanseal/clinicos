/**
 * Note generation, behind one interface.
 *
 * Default is Ollama on this machine — free, and the transcript never leaves.
 * "openai" points at any OpenAI-compatible /chat/completions endpoint.
 */
import { ClinicalNote, EMPTY_NOTE } from "./types";

export type NoteResult = {
  note: ClinicalNote;
  model: string;
  seconds: number;
  raw: string;
};

const SYSTEM_PROMPT = `You are a clinical documentation assistant for a primary care clinic in West Bengal, India.

You will receive a raw transcript of a consultation. The doctor and patient speak Bengali, Hindi and English, often mixed within a single sentence. The transcript will contain speech recognition errors.

Your job is to produce a structured clinical note. You are NOT diagnosing. You are recording what the doctor said and decided.

Hard rules:
- Record ONLY what is present in the transcript. Never invent a symptom, finding, dose or diagnosis.
- If the transcript does not contain something, leave that field as an empty string or empty array. An empty field is correct; a plausible guess is a patient-safety failure.
- Write the note in English. Keep Indian drug brand names exactly as spoken.
- For medications, only record a drug if the doctor actually named it. If the dose, frequency or duration was not stated, leave that specific field empty rather than assuming a standard regimen.
- Where the transcript is garbled and you are unsure, write what you heard followed by "(unclear)". Do not silently clean it up.

Respond with ONLY a JSON object, no markdown fences, in exactly this shape:
{
  "chiefComplaint": "string",
  "history": "string",
  "examination": "string",
  "diagnosis": "string",
  "medications": [{"name":"","dose":"","frequency":"","duration":"","instructions":""}],
  "investigations": ["string"],
  "advice": "string",
  "followUp": "string"
}`;

function extractJson(text: string): ClinicalNote {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start !== -1 && end !== -1) t = t.slice(start, end + 1);
  try {
    const raw = JSON.parse(t) as Partial<ClinicalNote>;
    return {
      ...EMPTY_NOTE,
      ...raw,
      medications: Array.isArray(raw.medications) ? raw.medications : [],
      investigations: Array.isArray(raw.investigations) ? raw.investigations : [],
      // Warning signs are the doctor's to write, never the model's, whatever
      // it sent back.
      returnIf: "",
    };
  } catch {
    return { ...EMPTY_NOTE, history: `[Could not parse model output]\n\n${text}` };
  }
}

export interface LlmProvider {
  generateNote(transcript: string, context?: string): Promise<NoteResult>;
}

class Ollama implements LlmProvider {
  async generateNote(transcript: string, context?: string): Promise<NoteResult> {
    const url = process.env.LLM_OLLAMA_URL || "http://127.0.0.1:11434";
    const model = process.env.LLM_OLLAMA_MODEL || "qwen2.5:7b-instruct";
    const started = Date.now();

    let res: Response;
    try {
      res = await fetch(`${url}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          stream: false,
          format: "json",
          options: { temperature: 0.1 },
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: buildUserPrompt(transcript, context) },
          ],
        }),
      });
    } catch {
      throw new Error(`Cannot reach Ollama at ${url}. Is it running?  ollama serve`);
    }
    if (!res.ok) throw new Error(`Ollama error (${res.status}): ${await res.text()}`);
    const data = (await res.json()) as { message?: { content?: string } };
    const raw = data.message?.content ?? "";
    return { note: extractJson(raw), model: `ollama:${model}`, seconds: (Date.now() - started) / 1000, raw };
  }
}

class OpenAiCompatible implements LlmProvider {
  async generateNote(transcript: string, context?: string): Promise<NoteResult> {
    const url = process.env.LLM_OPENAI_URL;
    const key = process.env.LLM_OPENAI_KEY;
    const model = process.env.LLM_OPENAI_MODEL;
    if (!url || !model) throw new Error("Note drafting isn't switched on here yet: no note-writing service is set up (LLM_OPENAI_URL, LLM_OPENAI_MODEL).");

    const started = Date.now();
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(transcript, context) },
        ],
      }),
    });
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        key
          ? "The note-writing service turned down this copy of ClinicOS's key. Whoever set it up needs to check LLM_OPENAI_KEY."
          : "Note drafting isn't switched on here yet: the note-writing service needs an API key (LLM_OPENAI_KEY)."
      );
    }
    if (!res.ok) throw new Error(`LLM error (${res.status}): ${await res.text()}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = data.choices?.[0]?.message?.content ?? "";
    return { note: extractJson(raw), model: `openai:${model}`, seconds: (Date.now() - started) / 1000, raw };
  }
}

function buildUserPrompt(transcript: string, context?: string) {
  return [
    context ? `Previous visits for this patient (for context only — do not copy findings forward):\n${context}\n` : "",
    "Transcript of today's consultation:",
    "---",
    transcript,
    "---",
    "Produce the JSON note now.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function getLlm(): LlmProvider {
  const provider = (process.env.LLM_PROVIDER || "ollama").toLowerCase();
  switch (provider) {
    case "ollama":
      return new Ollama();
    case "openai":
      return new OpenAiCompatible();
    default:
      throw new Error(`Unknown LLM_PROVIDER "${provider}". Use "ollama" or "openai".`);
  }
}
