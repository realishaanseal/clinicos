import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { getAiConfig } from "@/lib/ai-settings";
import { serviceSaid } from "@/lib/llm";

/**
 * TEMPORARY (see ai-settings.ts): does the saved AI setup actually answer?
 *
 * Without this an admin finds out mid-consultation, after a doctor has already
 * recorded two minutes of a patient's time. The checks are deliberately the
 * smallest that prove address, key and model together: a quarter-second of
 * silence to transcribe, and a one-word completion to draft. No patient data
 * is involved, so this is safe to run at any time.
 */
export const maxDuration = 60;

const TIMEOUT = 20_000;

/** A quarter-second of silence as a 16-bit mono 16 kHz WAV: enough for a
 *  transcription service to accept, decode and return nothing. */
function silentWav(): Buffer {
  const rate = 16000;
  const samples = rate / 4;
  const data = Buffer.alloc(samples * 2); // zeroes = silence
  const head = Buffer.alloc(44);
  head.write("RIFF", 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write("WAVE", 8);
  head.write("fmt ", 12);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20); // PCM
  head.writeUInt16LE(1, 22); // mono
  head.writeUInt32LE(rate, 24);
  head.writeUInt32LE(rate * 2, 28); // byte rate
  head.writeUInt16LE(2, 32); // block align
  head.writeUInt16LE(16, 34);
  head.write("data", 36);
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

type Check = { ok: boolean; detail: string; seconds: number };

async function timed(run: () => Promise<string>): Promise<Check> {
  const started = Date.now();
  try {
    return { ok: true, detail: await run(), seconds: (Date.now() - started) / 1000 };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e), seconds: (Date.now() - started) / 1000 };
  }
}

/** Says what went wrong in a sentence, without pasting the service's whole
 *  error page into the screen. */
async function refuse(res: Response, what: string): Promise<never> {
  const said = serviceSaid(await res.text().catch(() => ""));
  if (res.status === 401 || res.status === 403) {
    throw new Error(`${what} turned down the key (${res.status}).${said ? ` It said: ${said}` : ""}`);
  }
  // A 404 is read out rather than explained away. These services answer 404
  // for a model the key may not use as well as for a wrong address, so saying
  // only "check the address" sends whoever set it up looking in the wrong place.
  if (res.status === 404) {
    throw new Error(
      `${what} answered 404.${said ? ` It said: ${said}` : ""} Check the model name as well as the address — a 404 here is often a model this key cannot use.`
    );
  }
  throw new Error(`${what} answered ${res.status}${said ? `: ${said}` : "."}`);
}

export async function POST() {
  const auth = await requireApiUser("admin");
  if (auth.denied) return auth.denied;
  const cfg = await getAiConfig(auth.user.clinicId);

  const asr = await timed(async () => {
    if (cfg.asr.provider === "local") {
      const res = await fetch(`${cfg.asr.localUrl}/health`, { signal: AbortSignal.timeout(TIMEOUT) }).catch(() => {
        throw new Error(`Nothing is listening at ${cfg.asr.localUrl}. Start it with:  npm run asr`);
      });
      if (!res.ok) await refuse(res, "The local transcription service");
      return "The transcription service on this computer answered.";
    }
    if (!cfg.asr.url) throw new Error("No transcription address set.");
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(silentWav())], { type: "audio/wav" }), "test.wav");
    form.append("model", cfg.asr.model);
    if (cfg.asr.language) form.append("language", cfg.asr.language);
    const res = await fetch(cfg.asr.url, {
      method: "POST",
      headers: cfg.asr.key ? { Authorization: `Bearer ${cfg.asr.key}` } : undefined,
      body: form,
      signal: AbortSignal.timeout(TIMEOUT),
    }).catch((e) => {
      throw new Error(e?.name === "TimeoutError" ? "The transcription service did not answer in 20 seconds." : `Cannot reach ${cfg.asr.url}.`);
    });
    if (!res.ok) await refuse(res, "The transcription service");
    return `${cfg.asr.model} accepted a test recording.`;
  });

  const llm = await timed(async () => {
    if (cfg.llm.provider === "ollama") {
      const res = await fetch(`${cfg.llm.ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(TIMEOUT) }).catch(() => {
        throw new Error(`Nothing is listening at ${cfg.llm.ollamaUrl}. Start it with:  ollama serve`);
      });
      if (!res.ok) await refuse(res, "Ollama");
      const data = (await res.json()) as { models?: { name?: string }[] };
      const names = (data.models ?? []).map((m) => m.name ?? "");
      if (!names.includes(cfg.llm.ollamaModel)) {
        throw new Error(`Ollama is running but does not have ${cfg.llm.ollamaModel}. Pull it with:  ollama pull ${cfg.llm.ollamaModel}`);
      }
      return `${cfg.llm.ollamaModel} is ready on this computer.`;
    }
    if (!cfg.llm.url) throw new Error("No note-drafting address set.");
    if (!cfg.llm.model) throw new Error("No note-drafting model set.");
    const res = await fetch(cfg.llm.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(cfg.llm.key ? { Authorization: `Bearer ${cfg.llm.key}` } : {}) },
      body: JSON.stringify({
        model: cfg.llm.model,
        max_tokens: 30,
        temperature: 0,
        // The same shape a real note asks for. A service can answer an ordinary
        // question and still refuse JSON mode, and finding that out here beats
        // finding it out with a patient waiting.
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: 'Reply with this JSON object and nothing else: {"ready": true}' }],
      }),
      signal: AbortSignal.timeout(TIMEOUT),
    }).catch((e) => {
      throw new Error(e?.name === "TimeoutError" ? "The note-writing service did not answer in 20 seconds." : `Cannot reach ${cfg.llm.url}.`);
    });
    if (!res.ok) await refuse(res, "The note-writing service");
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    if (!data.choices?.length) throw new Error("The note-writing service answered, but not in the shape ClinicOS expects.");
    return `${cfg.llm.model} answered.`;
  });

  return NextResponse.json({ asr, llm });
}
