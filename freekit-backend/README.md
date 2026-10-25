# FreeKit API

A small, free-plan-friendly Flask API for the FreeKit static frontend.

## Deploy on Render
- Runtime: Python
- Build command: `cd freekit-backend && pip install -r requirements.txt`
- Start command: `cd freekit-backend && gunicorn app:app --bind 0.0.0.0:$PORT --workers 1 --threads 4 --timeout 60`
- Plan: Free
- Region: Singapore

## Endpoints
- `GET /` service info
- `GET /api/health` health status
- `GET /api/tools` available browser-local utilities
- `POST /api/text/stats` JSON body: `{"text":"hello world"}`
- `POST /api/json/format` JSON body: `{"text":"{\"a\":1}","compact":false}`

## Notes
- No API keys are committed to the repository.
- Image operations stay in the browser; files are not uploaded to this API.
- Database and AI providers are deliberately marked unconfigured until a free database/provider is explicitly connected.
- Rate limiting is in-memory and resets when the free service restarts. For production scale, use a persistent rate limiter.
