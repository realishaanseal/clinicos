#!/usr/bin/env bash
# ClinicOS — one command to set up and run everything.
#   chmod +x go.sh   (once)
#   ./go.sh
set -e
cd "$(dirname "$0")"
mkdir -p data/audio logs

say() { printf "\n\033[1;36m==> %s\033[0m\n" "$1"; }
die() { printf "\n\033[1;31m!! %s\033[0m\n\n" "$1"; exit 1; }

command -v node >/dev/null || die "Node.js is missing.  Install it:  brew install node"
command -v python3 >/dev/null || die "Python 3 is missing.  Install it:  brew install python"

[ -f .env ] || cp .env.example .env

if [ ! -d node_modules ]; then
  say "Installing app packages (a few minutes, once)"
  npm install
fi

# npm 12 blocks install scripts by default, so native modules install without
# ever compiling their binary — the install "succeeds" and the app crashes
# later. package.json allowlists better-sqlite3; make sure it actually built.
if ! node -e "require('better-sqlite3')" >/dev/null 2>&1; then
  say "Compiling the database driver (npm 12 skipped it)"
  npm rebuild better-sqlite3 >/dev/null 2>&1 || npm rebuild better-sqlite3
  node -e "require('better-sqlite3')" >/dev/null 2>&1 \
    || die "better-sqlite3 still will not load. Try:  rm -rf node_modules && npm install && npm rebuild better-sqlite3"
fi

if [ ! -d asr/.venv ]; then
  say "Setting up the local transcription service (once)"
  python3 -m venv asr/.venv
  ./asr/.venv/bin/pip install --quiet --upgrade pip
  ./asr/.venv/bin/pip install --quiet -r asr/requirements.txt
fi

# Ollama writes the clinical notes. It may be on PATH, or installed as a Mac
# app whose CLI was never linked — check both before giving up.
OLLAMA=""
if command -v ollama >/dev/null; then
  OLLAMA="$(command -v ollama)"
elif [ -x "/Applications/Ollama.app/Contents/Resources/ollama" ]; then
  OLLAMA="/Applications/Ollama.app/Contents/Resources/ollama"
elif [ -x "$HOME/Applications/Ollama.app/Contents/Resources/ollama" ]; then
  OLLAMA="$HOME/Applications/Ollama.app/Contents/Resources/ollama"
elif [ -x "/usr/local/bin/ollama" ]; then
  OLLAMA="/usr/local/bin/ollama"
fi

if [ -z "$OLLAMA" ]; then
  cat <<'MSG'

Ollama is not installed. It writes the clinical notes, and it runs entirely
on this machine. You do NOT need Homebrew.

  1. Download it:   https://ollama.com/download/mac
  2. Unzip, drag Ollama to your Applications folder
  3. Open it once (it will ask to install the command line tool - say yes)
  4. Re-run  ./go.sh

MSG
  exit 1
fi

# --- start everything -------------------------------------------------------
cleanup() {
  echo ""
  say "Shutting down"
  [ -n "$ASR_PID" ] && kill $ASR_PID 2>/dev/null || true
  [ -n "$APP_PID" ] && kill $APP_PID 2>/dev/null || true
  [ -n "$OLL_PID" ] && kill $OLL_PID 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

if ! curl -s -m 2 http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
  say "Starting Ollama"
  "$OLLAMA" serve > logs/ollama.log 2>&1 &
  OLL_PID=$!
  sleep 3
fi

MODEL=$(grep -E '^LLM_OLLAMA_MODEL' .env | cut -d'"' -f2)
MODEL=${MODEL:-qwen2.5:7b-instruct}
if ! "$OLLAMA" list 2>/dev/null | grep -q "${MODEL%%:*}"; then
  say "Downloading the language model '$MODEL' (once, a few GB)"
  "$OLLAMA" pull "$MODEL"
fi

say "Starting local transcription"
./asr/.venv/bin/python asr/server.py > logs/asr.log 2>&1 &
ASR_PID=$!

printf "    waiting for the Whisper model to load"
for i in $(seq 1 180); do
  if curl -s -m 2 http://127.0.0.1:8756/health >/dev/null 2>&1; then break; fi
  printf "."
  sleep 2
done
echo ""
curl -s -m 2 http://127.0.0.1:8756/health >/dev/null 2>&1 \
  && echo "    transcription ready" \
  || echo "    still loading — first run downloads the model. Watch: tail -f logs/asr.log"

say "Starting the app"
npm run dev > logs/app.log 2>&1 &
APP_PID=$!
sleep 5

echo ""
echo "  ClinicOS is running:  http://localhost:3000"
echo ""
echo "  logs:   tail -f logs/app.log   |   tail -f logs/asr.log"
echo "  stop:   press Ctrl-C here"
echo ""
command -v open >/dev/null && open http://localhost:3000

wait $APP_PID
