/**
 * TEMPORARY (20 Sep 2026, Ishaan's decision): the AI service's address, model
 * and key, settable from Clinic admin instead of only from the environment.
 *
 * It exists so the online copy can be switched on without a Vercel redeploy.
 * It is not where a provider key belongs — the key is Varaxis's, one account
 * serves every clinic, and Vercel's encrypted environment keeps it out of the
 * database that holds patient records. Remove this file, /api/admin/ai,
 * /api/admin/ai/test and AiSettings.tsx once the environment variables are set
 * for good, and getAsr/getLlm go back to reading process.env alone.
 *
 * The setting keys deliberately do not start clinic_ or rx_, so they never
 * travel to a clinic computer (isSharedSetting in sync.ts): a clinic computer
 * transcribes and drafts locally and must not be handed a hosted key.
 */
import { getSomeSettings, type ClinicId } from "./db";

/** Only the hosted fields are settable here. Where the local sidecar and
 *  Ollama listen stays machine configuration, in .env, not something typed
 *  into a browser. */
export const AI_SETTING_KEYS = [
  "ai_asr_provider",
  "ai_asr_url",
  "ai_asr_key",
  "ai_asr_model",
  "ai_asr_language",
  "ai_llm_provider",
  "ai_llm_url",
  "ai_llm_key",
  "ai_llm_model",
] as const;

export type AiConfig = {
  asr: { provider: string; localUrl: string; url: string; key: string; model: string; language: string };
  llm: { provider: string; ollamaUrl: string; ollamaModel: string; url: string; key: string; model: string };
};

/**
 * What this clinic's transcription and note drafting should use: whatever an
 * admin saved, falling back to the environment.
 *
 * Unlike clinic details (getClinic), the environment is the fallback for every
 * clinic, not only the first. The AI service is Varaxis's own infrastructure,
 * shared by every clinic online; a clinic's address on a prescription is not.
 */
export async function getAiConfig(clinicId: ClinicId): Promise<AiConfig> {
  const s = await getSomeSettings(clinicId, [...AI_SETTING_KEYS]);
  const env = process.env;
  return {
    asr: {
      provider: (s.ai_asr_provider || env.ASR_PROVIDER || "local").toLowerCase(),
      localUrl: env.ASR_LOCAL_URL || "http://127.0.0.1:8756",
      url: s.ai_asr_url || env.ASR_HTTP_URL || "",
      key: s.ai_asr_key || env.ASR_HTTP_KEY || "",
      model: s.ai_asr_model || env.ASR_HTTP_MODEL || "whisper-1",
      language: (s.ai_asr_language ?? env.ASR_LANGUAGE ?? "").trim(),
    },
    llm: {
      provider: (s.ai_llm_provider || env.LLM_PROVIDER || "ollama").toLowerCase(),
      ollamaUrl: env.LLM_OLLAMA_URL || "http://127.0.0.1:11434",
      ollamaModel: env.LLM_OLLAMA_MODEL || "qwen2.5:7b-instruct",
      url: s.ai_llm_url || env.LLM_OPENAI_URL || "",
      key: s.ai_llm_key || env.LLM_OPENAI_KEY || "",
      model: s.ai_llm_model || env.LLM_OPENAI_MODEL || "",
    },
  };
}

/** What Clinic admin is allowed to see: never a key, only that there is one
 *  and the last four characters, which is enough to tell two keys apart. */
export type AiConfigView = {
  asr: { provider: string; url: string; model: string; language: string; keySet: boolean; keyTail: string; fromEnv: boolean };
  llm: { provider: string; url: string; model: string; keySet: boolean; keyTail: string; fromEnv: boolean };
};

export function tailOf(key: string): string {
  return key.length > 4 ? key.slice(-4) : key ? "••••" : "";
}

export async function getAiConfigView(clinicId: ClinicId): Promise<AiConfigView> {
  const s = await getSomeSettings(clinicId, [...AI_SETTING_KEYS]);
  const cfg = await getAiConfig(clinicId);
  return {
    asr: {
      provider: cfg.asr.provider,
      url: cfg.asr.url,
      model: cfg.asr.model,
      language: cfg.asr.language,
      keySet: !!cfg.asr.key,
      keyTail: tailOf(cfg.asr.key),
      // Says where the key came from, so "it works here but not there" is answerable.
      fromEnv: !s.ai_asr_key && !!process.env.ASR_HTTP_KEY,
    },
    llm: {
      provider: cfg.llm.provider,
      url: cfg.llm.url,
      model: cfg.llm.model,
      keySet: !!cfg.llm.key,
      keyTail: tailOf(cfg.llm.key),
      fromEnv: !s.ai_llm_key && !!process.env.LLM_OPENAI_KEY,
    },
  };
}
