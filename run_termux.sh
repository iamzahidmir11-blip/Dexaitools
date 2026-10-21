#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f ".env" ]; then
  echo "Missing .env file."
  echo "Run: cp .env.termux.example .env"
  echo "Then edit .env and add your Gemini API key and database password."
  exit 1
fi

set -a
. ./.env
set +a

export PSYCOPG_IMPL=python
echo "Starting CumuloMind AI on http://127.0.0.1:5000"
exec gunicorn --workers 1 --threads 4 --timeout 90 --bind 0.0.0.0:5000 app:app
