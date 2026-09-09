#!/usr/bin/env bash
set -e

cd "$(dirname "$0")/.."

echo "==> ClinicOS local setup"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install Node 20+ first:  brew install node"
  exit 1
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo "  created .env  (edit it to set your clinic name and doctor name)"
fi

mkdir -p data/audio

echo "==> installing node packages"
npm install

echo "==> creating the database"
npx prisma db push --skip-generate
npx prisma generate

echo "==> setting up the local transcription service"
cd asr
if [ ! -d .venv ]; then
  python3 -m venv .venv
fi
./.venv/bin/pip install --quiet --upgrade pip
./.venv/bin/pip install --quiet -r requirements.txt
cd ..

echo ""
echo "Done. Now open two terminals:"
echo "  1)  npm run asr     # local transcription (first run downloads the model)"
echo "  2)  npm run dev     # the app, at http://localhost:3000"
echo ""
echo "You also need Ollama for note generation:"
echo "     brew install ollama && ollama serve"
echo "     ollama pull qwen2.5:7b-instruct"
