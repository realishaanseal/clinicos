"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { appPath } from "@/lib/base-path";
import type { AiConfigView } from "@/lib/ai-settings";
import { IcAlert, IcCheck, IcCog } from "./Icons";

/**
 * TEMPORARY (see lib/ai-settings.ts): Clinic admin's window onto the
 * transcription and note-drafting service, so the online copy can be switched
 * on without a redeploy.
 *
 * A key is write-only here. The server never sends one back, so the field is
 * always blank and only what was typed is submitted — which is also what lets
 * an admin change the model without re-entering the key.
 */
type Check = { ok: boolean; detail: string; seconds: number };

export default function AiSettings({ initial }: { initial: AiConfigView }) {
  const router = useRouter();
  const [asrProvider, setAsrProvider] = useState(initial.asr.provider);
  const [asrUrl, setAsrUrl] = useState(initial.asr.url);
  const [asrModel, setAsrModel] = useState(initial.asr.model);
  const [asrLanguage, setAsrLanguage] = useState(initial.asr.language);
  const [asrKey, setAsrKey] = useState("");
  const [llmProvider, setLlmProvider] = useState(initial.llm.provider);
  const [llmUrl, setLlmUrl] = useState(initial.llm.url);
  const [llmModel, setLlmModel] = useState(initial.llm.model);
  const [llmKey, setLlmKey] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [result, setResult] = useState<{ asr: Check; llm: Check } | null>(null);

  const asrHosted = asrProvider === "http";
  const llmHosted = llmProvider === "openai";

  async function post(body: Record<string, unknown>) {
    const res = await fetch(appPath("/api/admin/ai"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "That didn't work. Try again.");
  }

  async function run(what: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNote("");
    setResult(null);
    try {
      await what();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const save = () =>
    run(async () => {
      await post({
        asrProvider,
        asrUrl,
        asrModel,
        asrLanguage,
        llmProvider,
        llmUrl,
        llmModel,
        // Absent leaves the stored key alone; only what was typed is sent.
        ...(asrKey.trim() ? { asrKey } : {}),
        ...(llmKey.trim() ? { llmKey } : {}),
      });
      setAsrKey("");
      setLlmKey("");
      setNote("Saved. Use Test to check it answers.");
      router.refresh();
    });

  const clearKey = (which: "asr" | "llm") =>
    run(async () => {
      await post(which === "asr" ? { asrKey: null } : { llmKey: null });
      setNote("Key removed.");
      router.refresh();
    });

  const test = () =>
    run(async () => {
      const res = await fetch(appPath("/api/admin/ai/test"), { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "The test could not run.");
      setResult(data as { asr: Check; llm: Check });
    });

  function KeyState({ which }: { which: "asr" | "llm" }) {
    const of = which === "asr" ? initial.asr : initial.llm;
    if (!of.keySet) return <p className="hint">No key saved yet.</p>;
    return (
      <p className="hint">
        A key is saved (ending <span className="mono">{of.keyTail}</span>)
        {of.fromEnv
          ? ", set by Varaxis outside the app. Typing one here overrides it."
          : ". Typing one here replaces it."}{" "}
        {!of.fromEnv && (
          <button type="button" className="quiet small" onClick={() => clearKey(which)} disabled={busy}>
            Remove it
          </button>
        )}
      </p>
    );
  }

  return (
    <div className="card flush">
      <div className="card-head">
        <span className="title">Transcription and note drafting</span>
        <span className="muted">normally set by Varaxis</span>
      </div>
      <div className="card-body">
        <div className="note info">
          <IcCog size={16} />
          <span>
            A temporary window, so the service can be switched on without a redeploy. Consultation audio and transcripts
            go to whichever service is named here, so it must be one whose terms say it neither keeps nor trains on them.
          </span>
        </div>

        {error && (
          <div className="note err" role="alert">
            <IcAlert size={16} />
            <span>{error}</span>
          </div>
        )}
        {note && (
          <div className="note ok" role="status">
            <IcCheck size={16} />
            <span>{note}</span>
          </div>
        )}
        {result && (
          <>
            <div className={result.asr.ok ? "note ok" : "note err"} role="status">
              {result.asr.ok ? <IcCheck size={16} /> : <IcAlert size={16} />}
              <span>
                <strong>Transcription:</strong>{" "}
                {`${result.asr.detail} (${result.asr.seconds.toFixed(1)}s)`}
              </span>
            </div>
            <div className={result.llm.ok ? "note ok" : "note err"} role="status">
              {result.llm.ok ? <IcCheck size={16} /> : <IcAlert size={16} />}
              <span>
                <strong>Note drafting:</strong>{" "}
                {`${result.llm.detail} (${result.llm.seconds.toFixed(1)}s)`}
              </span>
            </div>
          </>
        )}

        <div className="field">
          <label htmlFor="asr-provider">Transcription happens</label>
          <select
            id="asr-provider"
            value={asrProvider}
            onChange={(e) => setAsrProvider(e.target.value)}
            style={{ maxWidth: 360 }}
          >
            <option value="local">On this computer — audio never leaves it</option>
            <option value="http">By a hosted service — audio is sent to it</option>
          </select>
        </div>

        {asrHosted && (
          <>
            <div className="field">
              <label htmlFor="asr-url">Transcription address</label>
              <input
                id="asr-url"
                value={asrUrl}
                onChange={(e) => setAsrUrl(e.target.value)}
                placeholder="https://api.groq.com/openai/v1/audio/transcriptions"
                spellCheck={false}
              />
              <p className="hint">The service&apos;s full address for transcribing audio.</p>
            </div>
            <div className="field">
              <label htmlFor="asr-model">Transcription model</label>
              <input
                id="asr-model"
                value={asrModel}
                onChange={(e) => setAsrModel(e.target.value)}
                placeholder="whisper-large-v3"
                spellCheck={false}
                style={{ maxWidth: 320 }}
              />
            </div>
            <div className="field">
              <label htmlFor="asr-key">Transcription API key</label>
              <input
                id="asr-key"
                type="password"
                value={asrKey}
                onChange={(e) => setAsrKey(e.target.value)}
                placeholder={initial.asr.keySet ? "Leave blank to keep the saved key" : "Paste the key"}
                autoComplete="off"
                spellCheck={false}
              />
              <KeyState which="asr" />
            </div>
          </>
        )}

        <div className="field">
          <label htmlFor="asr-language">Language spoken</label>
          <input
            id="asr-language"
            value={asrLanguage}
            onChange={(e) => setAsrLanguage(e.target.value)}
            placeholder="leave blank to detect"
            spellCheck={false}
            style={{ maxWidth: 200 }}
          />
          <p className="hint">
            Blank usually handles Bengali, Hindi and English mixed in one sentence best.{" "}
            <span className="mono">bn</span> forces Bengali.
          </p>
        </div>

        <div className="field">
          <label htmlFor="llm-provider">The note is drafted</label>
          <select
            id="llm-provider"
            value={llmProvider}
            onChange={(e) => setLlmProvider(e.target.value)}
            style={{ maxWidth: 360 }}
          >
            <option value="ollama">On this computer — the transcript never leaves it</option>
            <option value="openai">By a hosted service — the transcript is sent to it</option>
          </select>
        </div>

        {llmHosted && (
          <>
            <div className="field">
              <label htmlFor="llm-url">Note-drafting address</label>
              <input
                id="llm-url"
                value={llmUrl}
                onChange={(e) => setLlmUrl(e.target.value)}
                placeholder="https://api.groq.com/openai/v1/chat/completions"
                spellCheck={false}
              />
            </div>
            <div className="field">
              <label htmlFor="llm-model">Note-drafting model</label>
              <input
                id="llm-model"
                value={llmModel}
                onChange={(e) => setLlmModel(e.target.value)}
                placeholder="openai/gpt-oss-120b"
                spellCheck={false}
                style={{ maxWidth: 320 }}
              />
            </div>
            <div className="field">
              <label htmlFor="llm-key">Note-drafting API key</label>
              <input
                id="llm-key"
                type="password"
                value={llmKey}
                onChange={(e) => setLlmKey(e.target.value)}
                placeholder={initial.llm.keySet ? "Leave blank to keep the saved key" : "Paste the key"}
                autoComplete="off"
                spellCheck={false}
              />
              <KeyState which="llm" />
            </div>
          </>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={save} disabled={busy}>
            {busy ? "Working…" : "Save"}
          </button>
          <button type="button" className="quiet" onClick={test} disabled={busy}>
            Test
          </button>
        </div>
        <p className="hint">
          Test sends a quarter-second of silence and a one-line question, asked exactly the way a note is asked
          for. No patient information is involved.
        </p>
      </div>
    </div>
  );
}
