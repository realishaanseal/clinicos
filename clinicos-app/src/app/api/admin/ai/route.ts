import { NextRequest, NextResponse } from "next/server";
import { recordAudit, setSettings } from "@/lib/db";
import { requireApiUser } from "@/lib/auth";

/**
 * TEMPORARY (see ai-settings.ts): the transcription and note-drafting service,
 * set from Clinic admin instead of the environment.
 *
 * A key is write-only. It is never sent back to the browser, so the form sends
 * a key only when one was typed: an absent field leaves the stored key alone,
 * and null clears it. That is what lets an admin change the model without
 * having to re-enter the key.
 */
const ASR_PROVIDERS = ["local", "http"];
const LLM_PROVIDERS = ["ollama", "openai"];

function cleanUrl(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return s;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireApiUser("admin");
  if (auth.denied) return auth.denied;
  const body = await req.json().catch(() => ({}));
  const values: Record<string, string> = {};
  const said: string[] = [];

  if (body.asrProvider !== undefined) {
    const p = String(body.asrProvider ?? "").trim().toLowerCase();
    if (!ASR_PROVIDERS.includes(p)) return NextResponse.json({ error: "Choose where transcription happens." }, { status: 400 });
    values.ai_asr_provider = p;
    said.push(`transcription ${p === "local" ? "on this computer" : "by a hosted service"}`);
  }
  if (body.llmProvider !== undefined) {
    const p = String(body.llmProvider ?? "").trim().toLowerCase();
    if (!LLM_PROVIDERS.includes(p)) return NextResponse.json({ error: "Choose where the note is drafted." }, { status: 400 });
    values.ai_llm_provider = p;
    said.push(`note drafting ${p === "ollama" ? "on this computer" : "by a hosted service"}`);
  }
  if (body.asrUrl !== undefined) {
    const url = cleanUrl(body.asrUrl);
    if (url === null) return NextResponse.json({ error: "The transcription address should start with https://" }, { status: 400 });
    values.ai_asr_url = url;
  }
  if (body.llmUrl !== undefined) {
    const url = cleanUrl(body.llmUrl);
    if (url === null) return NextResponse.json({ error: "The note-drafting address should start with https://" }, { status: 400 });
    values.ai_llm_url = url;
  }
  if (body.asrModel !== undefined) values.ai_asr_model = String(body.asrModel ?? "").trim().slice(0, 120);
  if (body.llmModel !== undefined) values.ai_llm_model = String(body.llmModel ?? "").trim().slice(0, 120);
  if (body.asrLanguage !== undefined) values.ai_asr_language = String(body.asrLanguage ?? "").trim().slice(0, 10);
  if (body.asrUrl !== undefined || body.asrModel !== undefined || body.asrLanguage !== undefined) said.push("transcription service");
  if (body.llmUrl !== undefined || body.llmModel !== undefined) said.push("note-drafting service");

  // null clears; a string sets. Never logged, never read back.
  if (body.asrKey === null || typeof body.asrKey === "string") {
    values.ai_asr_key = body.asrKey === null ? "" : body.asrKey.trim();
    said.push(values.ai_asr_key ? "transcription key set" : "transcription key removed");
  }
  if (body.llmKey === null || typeof body.llmKey === "string") {
    values.ai_llm_key = body.llmKey === null ? "" : body.llmKey.trim();
    said.push(values.ai_llm_key ? "note-drafting key set" : "note-drafting key removed");
  }

  if (!Object.keys(values).length) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });

  await setSettings(auth.user.clinicId, values);
  // The key itself never reaches the activity log — only that it changed.
  await recordAudit(auth.user.clinicId, auth.user, "ai_settings_update", "clinic", null, [...new Set(said)].join(", "));
  return NextResponse.json({ ok: true });
}
