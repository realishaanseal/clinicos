/**
 * Speech recognition, behind one interface.
 *
 * The default provider is "local": a Python sidecar running faster-whisper on
 * this machine. Audio never touches a network. That is the only configuration
 * that lets you honestly read the patient consent script as written.
 *
 * Swap providers by changing ASR_PROVIDER in .env. Nothing else changes.
 */

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
  async transcribe(audio: Buffer, filename: string): Promise<TranscriptionResult> {
    const url = process.env.ASR_LOCAL_URL || "http://127.0.0.1:8756";
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(audio)]), filename);
    const lang = process.env.ASR_LANGUAGE?.trim();
    if (lang) form.append("language", lang);

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
  async transcribe(audio: Buffer, filename: string): Promise<TranscriptionResult> {
    const url = process.env.ASR_HTTP_URL;
    const key = process.env.ASR_HTTP_KEY;
    const model = process.env.ASR_HTTP_MODEL || "whisper-1";
    if (!url) throw new Error("ASR_PROVIDER=http but ASR_HTTP_URL is not set.");

    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(audio)]), filename);
    form.append("model", model);
    const lang = process.env.ASR_LANGUAGE?.trim();
    if (lang) form.append("language", lang);

    const started = Date.now();
    const res = await fetch(url, {
      method: "POST",
      headers: key ? { Authorization: `Bearer ${key}` } : undefined,
      body: form,
    });
    if (!res.ok) throw new Error(`Transcription failed (${res.status}): ${await res.text()}`);
    const data = (await res.json()) as { text: string };
    return {
      text: (data.text || "").trim(),
      model: `http:${model}`,
      seconds: (Date.now() - started) / 1000,
    };
  }
}

export function getAsr(): AsrProvider {
  const provider = (process.env.ASR_PROVIDER || "local").toLowerCase();
  switch (provider) {
    case "local":
      return new LocalWhisper();
    case "http":
      return new HttpWhisper();
    default:
      throw new Error(`Unknown ASR_PROVIDER "${provider}". Use "local" or "http".`);
  }
}
