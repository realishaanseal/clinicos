/**
 * Speech recognition, behind one interface.
 *
 * The default provider is "local": a Python sidecar running faster-whisper on
 * this machine. Audio never touches a network. That is the only configuration
 * that lets you honestly read the patient consent script as written.
 *
 * Swap providers by changing ASR_PROVIDER in .env. Nothing else changes.
 * An admin can also set the hosted service from Clinic admin, which takes
 * precedence over .env — see ai-settings.ts, which is temporary.
 */
import { getAiConfig, type AiConfig } from "./ai-settings";
import type { ClinicId } from "./db";

export type TranscriptionResult = {
  text: string;
  model: string;
  seconds: number; // wall clock, for your unit economics sheet
  language?: string;
};

export interface AsrProvider {
  transcribe(audio: Buffer, filename: string): Promise<TranscriptionResult>;
}

class LocalWhisper implements AsrProvider {
  constructor(private cfg: AiConfig["asr"]) {}

  async transcribe(audio: Buffer, filename: string): Promise<TranscriptionResult> {
    const url = this.cfg.localUrl;
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(audio)]), filename);
    if (this.cfg.language) form.append("language", this.cfg.language);

    const started = Date.now();
    let res: Response;
    try {
      res = await fetch(`${url}/transcribe`, { method: "POST", body: form });
    } catch {
      throw new Error(
        `Cannot reach the local transcription service at ${url}. Start it with:  npm run asr`
      );
    }
    if (!res.ok) throw new Error(`Transcription failed (${res.status}): ${await res.text()}`);
    const data = (await res.json()) as { text: string; model: string; language?: string };
    return {
      text: (data.text || "").trim(),
      model: `local:${data.model}`,
      language: data.language,
      seconds: (Date.now() - started) / 1000,
    };
  }
}

class HttpWhisper implements AsrProvider {
  constructor(private cfg: AiConfig["asr"]) {}

  async transcribe(audio: Buffer, filename: string): Promise<TranscriptionResult> {
    const { url, key, model, language } = this.cfg;
    // Read by a doctor: say what is missing, not which variable.
    if (!url) throw new Error("Transcription isn't switched on here yet: no transcription service is set up. An admin can add it in Clinic admin.");

    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(audio)]), filename);
    form.append("model", model);
    if (language) form.append("language", language);

    const started = Date.now();
    const res = await fetch(url, {
      method: "POST",
      headers: key ? { Authorization: `Bearer ${key}` } : undefined,
      body: form,
    });
    if (res.status === 401 || res.status === 403) {
      // Seen by a doctor, so it says what is wrong rather than quoting the service.
      throw new Error(
        key
          ? "The transcription service turned down this copy of ClinicOS's key. Whoever set it up needs to check it in Clinic admin."
          : "Transcription isn't switched on here yet: the transcription service needs an API key. An admin can add it in Clinic admin."
      );
    }
    if (!res.ok) throw new Error(`Transcription failed (${res.status}): ${await res.text()}`);
    const data = (await res.json()) as { text: string };
    return {
      text: (data.text || "").trim(),
      model: `http:${model}`,
      seconds: (Date.now() - started) / 1000,
    };
  }
}

export function asrFor(cfg: AiConfig["asr"]): AsrProvider {
  switch (cfg.provider) {
    case "local":
      return new LocalWhisper(cfg);
    case "http":
      return new HttpWhisper(cfg);
    default:
      throw new Error(`Unknown transcription service "${cfg.provider}". Use "local" or "http".`);
  }
}

export async function getAsr(clinicId: ClinicId): Promise<AsrProvider> {
  return asrFor((await getAiConfig(clinicId)).asr);
}
