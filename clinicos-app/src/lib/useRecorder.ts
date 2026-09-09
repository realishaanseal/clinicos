"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type RecorderState = {
  recording: boolean;
  elapsed: number;
  uploadedBytes: number;
  chunksPending: number;
  error: string;
};

/**
 * Recording that streams to disk as it happens.
 *
 * The naive version accumulates every chunk in memory and uploads once, at
 * stop. That means a consultation exists only in a browser tab's RAM for its
 * entire duration — close the laptop at minute nine and all nine minutes are
 * gone, with a patient sitting there.
 *
 * Here each slice is posted as it arrives. Uploads are serialised through a
 * promise chain so the WebM stream is appended strictly in order.
 */
export function useRecorder(consultId: string) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [uploadedBytes, setUploadedBytes] = useState(0);
  const [chunksPending, setChunksPending] = useState(0);
  const [error, setError] = useState("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const firstRef = useRef(true);
  const wakeRef = useRef<WakeLockSentinel | null>(null);
  const elapsedRef = useRef(0);

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    wakeRef.current?.release().catch(() => {});
    wakeRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const upload = useCallback(
    (blob: Blob) => {
      setChunksPending((n) => n + 1);
      const isFirst = firstRef.current;
      firstRef.current = false;

      chainRef.current = chainRef.current
        .then(async () => {
          // Retry once — a transient hiccup should not punch a hole in the audio.
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              const res = await fetch(
                `/api/consults/${consultId}/audio/chunk${isFirst ? "?first=1" : ""}`,
                { method: "POST", body: blob, headers: { "Content-Type": "application/octet-stream" } }
              );
              if (!res.ok) throw new Error(await res.text());
              const data = await res.json();
              setUploadedBytes(data.total ?? 0);
              setError("");
              return;
            } catch (e) {
              if (attempt === 1) {
                setError(
                  "Audio is not reaching disk. Stop and check the app is still running — everything captured so far is already saved."
                );
                console.error("chunk upload failed", e);
              }
            }
          }
        })
        .finally(() => setChunksPending((n) => Math.max(0, n - 1)));
    },
    [consultId]
  );

  const start = useCallback(async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;

      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);

      firstRef.current = true;
      setUploadedBytes(0);
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) upload(e.data);
      };
      rec.onerror = () => setError("The recorder stopped unexpectedly. Audio up to this point is saved.");

      // 5-second slices: small enough that a crash costs almost nothing,
      // large enough not to hammer the disk during a 20-minute consultation.
      rec.start(5000);
      recorderRef.current = rec;

      setRecording(true);
      setElapsed(0);
      elapsedRef.current = 0;
      timerRef.current = setInterval(() => {
        elapsedRef.current += 1;
        setElapsed(elapsedRef.current);
      }, 1000);

      // Stop the screen sleeping mid-consultation and killing the recorder.
      try {
        wakeRef.current = (await navigator.wakeLock?.request("screen")) ?? null;
      } catch {
        /* unsupported or denied — not fatal */
      }
    } catch {
      setError(
        "Could not access the microphone. Allow mic access for this site — it must be served from localhost, not opened as a file."
      );
    }
  }, [upload]);

  const stop = useCallback(async () => {
    const rec = recorderRef.current;
    if (!rec) return;

    const done = new Promise<void>((resolve) => {
      rec.addEventListener("stop", () => resolve(), { once: true });
    });
    rec.requestData(); // flush the partial slice before closing
    rec.stop();
    await done;

    setRecording(false);
    cleanup();

    await chainRef.current; // every chunk is on disk before we finalise

    try {
      await fetch(`/api/consults/${consultId}/audio/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seconds: elapsedRef.current }),
      });
    } catch {
      /* the audio is on disk either way; Today will show it as interrupted */
    }
  }, [cleanup, consultId]);

  return { recording, elapsed, uploadedBytes, chunksPending, error, start, stop, setError };
}
