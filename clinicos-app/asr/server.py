"""
Local speech recognition for ClinicOS.

Runs faster-whisper on this machine. Consultation audio is never sent anywhere.
That is what makes the patient consent script honest.

    python -m venv .venv && source .venv/bin/activate
    pip install -r requirements.txt
    python server.py
"""

import os
import tempfile
import time

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import JSONResponse
from faster_whisper import WhisperModel

# tiny / base / small / medium / large-v3
# On a MacBook Air start with "small". Move up only if accuracy is the blocker;
# "medium" roughly triples the time per consult.
MODEL_SIZE = os.getenv("WHISPER_MODEL", "small")
COMPUTE = os.getenv("WHISPER_COMPUTE", "int8")
PORT = int(os.getenv("ASR_PORT", "8756"))

print(f"[clinicos-asr] loading faster-whisper '{MODEL_SIZE}' ({COMPUTE})…")
print("[clinicos-asr] first run downloads the model — this takes a few minutes, once.")
model = WhisperModel(MODEL_SIZE, device="cpu", compute_type=COMPUTE)
print("[clinicos-asr] ready.")

app = FastAPI(title="ClinicOS local ASR")


@app.get("/health")
def health():
    return {"ok": True, "model": MODEL_SIZE}


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...), language: str | None = Form(None)):
    started = time.time()
    suffix = os.path.splitext(file.filename or "audio.webm")[1] or ".webm"

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
        path = tmp.name

    # A file from an interrupted recording is a WebM stream that was never
    # closed. ffmpeg/PyAV will decode everything up to the truncation and then
    # stop, which is exactly what we want — partial audio beats no audio.
    try:
        segments, info = model.transcribe(
            path,
            language=language or None,      # None = auto-detect, usually better for code-mixing
            task="transcribe",
            beam_size=5,
            vad_filter=True,                # drops waiting-room silence, saves real time
            vad_parameters={"min_silence_duration_ms": 700},
            condition_on_previous_text=False,  # stops the model inventing continuations
        )
        text = " ".join(s.text.strip() for s in segments).strip()
        return {
            "text": text,
            "model": MODEL_SIZE,
            "language": getattr(info, "language", None),
            "seconds": round(time.time() - started, 2),
        }
    except Exception as e:  # noqa: BLE001
        return JSONResponse({"error": str(e)}, status_code=500)
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="warning")
