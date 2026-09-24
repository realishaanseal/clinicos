/**
 * Note generation, behind one interface.
 *
 * Default is Ollama on this machine — free, and the transcript never leaves.
 * "openai" points at any OpenAI-compatible /chat/completions endpoint.
 *
 * An admin can also set the hosted service from Clinic admin, which takes
 * precedence over .env — see ai-settings.ts, which is temporary.
 */
import { getAiConfig, type AiConfig } from "./ai-settings";
import type { ClinicId } from "./db";
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

/**
 * The one sentence a service put in its error, rather than its whole page.
 *
 * Shared with the Clinic admin test, so the two cannot disagree about what
 * went wrong. It matters most on a 404: an OpenAI-compatible service answers
 * 404 both for a wrong address and for a model this key may not use, and only
 * the service's own sentence says which.
 */
export function serviceSaid(body: string): string {
  if (!body.trim()) return "";
  try {
    const j = JSON.parse(body) as { error?: { message?: string } | string; message?: string };
    const m = typeof j.error === "string" ? j.error : j.error?.message ?? j.message;
    if (m) return m.trim().slice(0, 200);
  } catch {
    // Not JSON — an HTML error page, say. Its first words still beat nothing.
  }
  return body.trim().slice(0, 200);
}

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
      // Warning signs and the date to come back are the doctor's to write,
      // never the model's, whatever it sent back.
      returnIf: "",
      followUpOn: "",
    };
  } catch {
    return { ...EMPTY_NOTE, history: `[Could not parse model output]\n\n${text}` };
  }
}

export interface LlmProvider {
  generateNote(transcript: string, context?: string): Promise<NoteResult>;
}

class Ollama implements LlmProvider {
  constructor(private cfg: AiConfig["llm"]) {}

  async generateNote(transcript: string, context?: string): Promise<NoteResult> {
    const url = this.cfg.ollamaUrl;
    const model = this.cfg.ollamaModel;
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
  constructor(private cfg: AiConfig["llm"]) {}

  async generateNote(transcript: string, context?: string): Promise<NoteResult> {
    const { url, key, model } = this.cfg;
    if (!url || !model) throw new Error("Note drafting isn't switched on here yet: no note-writing service is set up. An admin can add it in Clinic admin.");

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
          ? "The note-writing service turned down this copy of ClinicOS's key. Whoever set it up needs to check it in Clinic admin."
          : "Note drafting isn't switched on here yet: the note-writing service needs an API key. An admin can add it in Clinic admin."
      );
    }
    if (!res.ok) {
      const said = serviceSaid(await res.text().catch(() => ""));
      throw new Error(
        res.status === 404
          ? `The note-writing service has no "${model}" for this key (404).${said ? ` It said: ${said}` : ""} An admin can change the model in Clinic admin.`
          : `The note-writing service answered ${res.status}${said ? `: ${said}` : "."}`
      );
    }
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

export function llmFor(cfg: AiConfig["llm"]): LlmProvider {
  switch (cfg.provider) {
    case "ollama":
      return new Ollama(cfg);
    case "openai":
      return new OpenAiCompatible(cfg);
    default:
      throw new Error(`Unknown note-writing service "${cfg.provider}". Use "ollama" or "openai".`);
  }
}

export async function getLlm(clinicId: ClinicId): Promise<LlmProvider> {
  return llmFor((await getAiConfig(clinicId)).llm);
}
