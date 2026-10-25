import os
import time
from collections import defaultdict, deque
from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 1 * 1024 * 1024

ALLOWED_ORIGINS = {
    "https://iamzahidmir11-blip.github.io",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
}
CORS(app, resources={r"/api/*": {"origins": list(ALLOWED_ORIGINS)}})

_hits = defaultdict(deque)
WINDOW_SECONDS = 60
MAX_REQUESTS = 30

@app.before_request
def rate_limit():
    if not request.path.startswith("/api/"):
        return None
    ip = request.headers.get("X-Forwarded-For", request.remote_addr or "unknown").split(",")[0].strip()
    now = time.time()
    q = _hits[ip]
    while q and now - q[0] > WINDOW_SECONDS:
        q.popleft()
    if len(q) >= MAX_REQUESTS:
        return jsonify({"ok": False, "error": "Rate limit reached. Please wait a minute and try again."}), 429
    q.append(now)
    return None

@app.get("/")
def home():
    return jsonify({
        "service": "FreeKit API",
        "status": "online",
        "message": "FreeKit backend is running.",
        "health": "/api/health",
        "endpoints": ["/api/health", "/api/tools", "/api/text/stats", "/api/json/format"]
    })

@app.get("/api/health")
def health():
    return jsonify({
        "ok": True,
        "service": "FreeKit API",
        "status": "online",
        "database": "not_configured",
        "ai": "not_configured",
        "note": "Image and text utilities run locally in the browser. Add optional provider secrets through Render environment settings."
    })

@app.get("/api/tools")
def tools():
    return jsonify({"ok": True, "tools": [
        {"id": "image-compress", "name": "Image compressor", "mode": "browser-local", "free": True},
        {"id": "image-resize", "name": "Image resizer", "mode": "browser-local", "free": True},
        {"id": "text-stats", "name": "Word and character counter", "mode": "browser-local", "free": True},
        {"id": "json-format", "name": "JSON formatter", "mode": "browser-local", "free": True}
    ]})

@app.post("/api/text/stats")
def text_stats():
    data = request.get_json(silent=True) or {}
    text = data.get("text", "")
    if not isinstance(text, str):
        return jsonify({"ok": False, "error": "'text' must be a string"}), 400
    words = len(text.split())
    sentences = len([s for s in __import__("re").split(r"[.!?]+", text) if s.strip()])
    return jsonify({"ok": True, "words": words, "characters": len(text), "characters_without_spaces": len("".join(text.split())), "sentences": sentences, "reading_minutes": (words + 199) // 200})

@app.post("/api/json/format")
def json_format():
    import json
    data = request.get_json(silent=True) or {}
    raw = data.get("text", "")
    compact = bool(data.get("compact", False))
    if not isinstance(raw, str):
        return jsonify({"ok": False, "error": "'text' must be a string"}), 400
    try:
        parsed = json.loads(raw)
        output = json.dumps(parsed, ensure_ascii=False, separators=(",", ":") if compact else None, indent=None if compact else 2)
        return jsonify({"ok": True, "valid": True, "result": output})
    except json.JSONDecodeError as exc:
        return jsonify({"ok": False, "valid": False, "error": f"{exc.msg} (line {exc.lineno}, column {exc.colno})"}), 400

@app.errorhandler(413)
def too_large(_):
    return jsonify({"ok": False, "error": "Request too large. Maximum request size is 1 MB."}), 413

@app.errorhandler(404)
def not_found(_):
    return jsonify({"ok": False, "error": "Endpoint not found"}), 404

@app.errorhandler(500)
def server_error(_):
    return jsonify({"ok": False, "error": "Unexpected server error"}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "10000")))
