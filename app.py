import os
import time
import hashlib
import base64
from datetime import datetime, timedelta, timezone
from functools import wraps

import jwt
import psycopg
from psycopg.rows import dict_row
from flask import Flask, request, jsonify, g, send_from_directory
from werkzeug.security import generate_password_hash, check_password_hash
from google import genai
from google.genai import types

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 28 * 1024 * 1024
ORIGIN = os.getenv("FRONTEND_ORIGIN", "https://iamzahidmir11-blip.github.io")
MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
FREE_DAILY_LIMIT = int(os.getenv("FREE_DAILY_LIMIT", "50"))
GUEST_DAILY_LIMIT = int(os.getenv("GUEST_DAILY_LIMIT", "3"))
PLUS_DAILY_LIMIT = int(os.getenv("PLUS_DAILY_LIMIT", "50"))
PRO_DAILY_LIMIT = int(os.getenv("PRO_DAILY_LIMIT", "150"))
CACHE_TTL_SECONDS = int(os.getenv("CACHE_TTL_SECONDS", "300"))
MAX_MESSAGE_LENGTH = 4000
SCHEMA_READY = False
SCHEMA_LAST_CHECK = 0
MEMORY_CACHE = {}
MEMORY_USAGE = {}

def db():
    url = os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is not configured in Render.")
    return psycopg.connect(url, row_factory=dict_row, connect_timeout=8)

def init_db():
    global SCHEMA_READY, SCHEMA_LAST_CHECK
    if SCHEMA_READY and time.time() - SCHEMA_LAST_CHECK < 300:
        return
    with db() as conn:
        conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          display_name TEXT NOT NULL DEFAULT '',
          plan TEXT NOT NULL DEFAULT 'free',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )""")
        conn.execute("""
        CREATE TABLE IF NOT EXISTS conversations (
          id BIGSERIAL PRIMARY KEY,
          user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
          role TEXT NOT NULL CHECK (role IN ('user','assistant')),
          content TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )""")
        conn.execute("""
        CREATE TABLE IF NOT EXISTS usage_events (
          id BIGSERIAL PRIMARY KEY,
          user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
          client_key TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )""")
        conn.execute("""
        CREATE INDEX IF NOT EXISTS usage_events_created_idx ON usage_events(created_at)""")
        conn.execute("""
        CREATE TABLE IF NOT EXISTS ai_cache (
          cache_key TEXT PRIMARY KEY,
          response TEXT NOT NULL,
          expires_at TIMESTAMPTZ NOT NULL
        )""")
        conn.execute("CREATE INDEX IF NOT EXISTS ai_cache_expiry_idx ON ai_cache(expires_at)")
    SCHEMA_READY = True
    SCHEMA_LAST_CHECK = time.time()

def plan_limit(plan):
    plan = (plan or "free").lower()
    if plan == "plus":
        return PLUS_DAILY_LIMIT
    if plan == "pro":
        return PRO_DAILY_LIMIT
    if plan == "premium":
        return int(os.getenv("PREMIUM_DAILY_LIMIT", "100"))
    return FREE_DAILY_LIMIT

def token_secret():
    return os.getenv("JWT_SECRET")

def make_token(user):
    secret = token_secret()
    if not secret:
        raise RuntimeError("JWT_SECRET is not configured in Render.")
    return jwt.encode({
        "sub": user["id"],
        "email": user["email"],
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "iat": datetime.now(timezone.utc)
    }, secret, algorithm="HS256")

def current_user():
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    secret = token_secret()
    if not secret:
        return None
    try:
        payload = jwt.decode(auth[7:], secret, algorithms=["HS256"])
        init_db()
        with db() as conn:
            return conn.execute(
                "SELECT id,email,display_name,plan,created_at FROM users WHERE id=%s",
                (payload["sub"],)
            ).fetchone()
    except Exception:
        return None

def cors(response):
    origin = request.headers.get("Origin")
    if origin == ORIGIN:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PATCH, OPTIONS"
    response.headers["Access-Control-Max-Age"] = "86400"
    return response

app.after_request(cors)

@app.errorhandler(500)
def server_error(_error):
    return jsonify({"error": "Server error. Please try again later."}), 500

@app.route("/", methods=["GET"])
def home():
    # Serve the premium DexAI frontend from the same public URL as the API.
    return send_from_directory(os.path.dirname(os.path.abspath(__file__)), "index.html")

@app.route("/health", methods=["GET"])
@app.route("/api/health", methods=["GET"])
def health():
    configured = configured_providers()
    status = {
        "service": "online",
        "database": "not_configured",
        "auth_configured": bool(token_secret()),
        "ai_configured": bool(configured),
        "providers_configured": [item["id"] for item in configured],
        "model": MODEL,
        "model_tested": False
    }
    try:
        init_db()
        status["database"] = "connected"
    except Exception:
        app.logger.exception("Health check database failure")
        status["database"] = "unavailable"
    ready = status["database"] == "connected" and status["auth_configured"] and status["ai_configured"]
    return jsonify(status), (200 if ready else 503)

@app.route("/api/auth/signup", methods=["POST", "OPTIONS"])
def signup():
    if request.method == "OPTIONS":
        return "", 204
    data = request.get_json(silent=True) or {}
    name = str(data.get("name", "")).strip()[:80]
    email = str(data.get("email", "")).strip().lower()[:254]
    password = str(data.get("password", ""))
    if not email or "@" not in email or len(email) < 5:
        return jsonify({"error": "Enter a valid email address."}), 400
    if len(password) < 8 or len(password) > 128:
        return jsonify({"error": "Password must be 8–128 characters."}), 400
    if not name:
        name = email.split("@")[0][:80]
    if not token_secret():
        return jsonify({"error": "Account security is not configured on the server yet. Please try again later."}), 503
    try:
        init_db()
        user_id = hashlib.sha256(os.urandom(32)).hexdigest()
        with db() as conn:
            conn.execute(
                "INSERT INTO users (id,email,password_hash,display_name) VALUES (%s,%s,%s,%s)",
                (user_id, email, generate_password_hash(password), name)
            )
            user = conn.execute(
                "SELECT id,email,display_name,plan,created_at FROM users WHERE id=%s",
                (user_id,)
            ).fetchone()
        return jsonify({"token": make_token(user), "user": dict(user)}), 201
    except psycopg.errors.UniqueViolation:
        return jsonify({"error": "An account with this email already exists. Log in instead."}), 409
    except Exception:
        app.logger.exception("Signup failed")
        return jsonify({"error": "Signup is temporarily unavailable. Check server database configuration."}), 503

@app.route("/api/auth/login", methods=["POST", "OPTIONS"])
def login():
    if request.method == "OPTIONS":
        return "", 204
    data = request.get_json(silent=True) or {}
    email = str(data.get("email", "")).strip().lower()[:254]
    password = str(data.get("password", ""))
    try:
        init_db()
        with db() as conn:
            user = conn.execute("SELECT * FROM users WHERE email=%s", (email,)).fetchone()
        if not user or not check_password_hash(user["password_hash"], password):
            return jsonify({"error": "Email or password is incorrect."}), 401
        public_user = {k: user[k] for k in ("id", "email", "display_name", "plan", "created_at")}
        return jsonify({"token": make_token(public_user), "user": public_user})
    except Exception:
        app.logger.exception("Login failed")
        return jsonify({"error": "Login is temporarily unavailable. Check server configuration."}), 503

@app.route("/api/auth/me", methods=["GET", "OPTIONS"])
def me():
    if request.method == "OPTIONS":
        return "", 204
    user = current_user()
    if not user:
        return jsonify({"error": "Please log in."}), 401
    return jsonify({"user": dict(user)})

@app.route("/api/auth/profile", methods=["PATCH", "OPTIONS"])
def update_profile():
    if request.method == "OPTIONS":
        return "", 204
    user = current_user()
    if not user:
        return jsonify({"error": "Please sign in to manage your profile."}), 401
    data = request.get_json(silent=True) or {}
    name = str(data.get("display_name", "")).strip()
    if not name or len(name) > 80:
        return jsonify({"error": "Display name must be 1–80 characters."}), 400
    try:
        init_db()
        with db() as conn:
            updated = conn.execute(
                "UPDATE users SET display_name=%s WHERE id=%s RETURNING id,email,display_name,plan,created_at",
                (name, user["id"])
            ).fetchone()
        return jsonify({"user": dict(updated)})
    except Exception:
        app.logger.exception("Profile update failed")
        return jsonify({"error": "Profile update is temporarily unavailable."}), 503

@app.route("/api/history", methods=["GET", "OPTIONS"])
def history():
    if request.method == "OPTIONS":
        return "", 204
    user = current_user()
    if not user:
        return jsonify({"error": "Log in to view chat history."}), 401
    try:
        init_db()
        with db() as conn:
            rows = conn.execute(
                "SELECT role,content,created_at FROM conversations WHERE user_id=%s ORDER BY id DESC LIMIT 100",
                (user["id"],)
            ).fetchall()
        return jsonify({"messages": [dict(r) for r in reversed(rows)]})
    except Exception:
        return jsonify({"error": "History is temporarily unavailable."}), 503

@app.route("/api/usage", methods=["GET", "OPTIONS"])
def usage():
    if request.method == "OPTIONS":
        return "", 204
    user = current_user()
    if not user:
        return jsonify({"error": "Sign in to view your daily chat usage."}), 401
    try:
        init_db()
        limit = plan_limit(user["plan"])
        client_key = "user:" + user["id"]
        with db() as conn:
            used = conn.execute(
                "SELECT COUNT(*) AS n FROM usage_events WHERE client_key=%s AND created_at >= date_trunc('day', NOW())",
                (client_key,)
            ).fetchone()["n"]
        return jsonify({"plan": user["plan"], "used": used, "limit": limit, "remaining": max(0, limit - used), "daily_access": used < limit})
    except Exception:
        app.logger.exception("Usage lookup failed")
        return jsonify({"error": "Usage information is temporarily unavailable."}), 503


@app.route("/api/image", methods=["POST", "OPTIONS"])
def generate_image():
    if request.method == "OPTIONS":
        return "", 204
    user = current_user()
    if not user:
        return jsonify({"error": "Please sign in before generating images.", "code": "AUTH_REQUIRED"}), 401
    data = request.get_json(silent=True) or {}
    prompt = str(data.get("prompt", "")).strip()
    if not prompt:
        return jsonify({"error": "Describe the image you want to create."}), 400
    if len(prompt) > 1200:
        return jsonify({"error": "Image prompt is too long (maximum 1200 characters)."}), 413
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return jsonify({"error": "AI configuration is incomplete."}), 503
    try:
        init_db()
        limit = plan_limit(user["plan"])
        client_key = "user:" + user["id"]
        with db() as conn:
            used = conn.execute(
                "SELECT COUNT(*) AS n FROM usage_events WHERE client_key=%s AND created_at >= date_trunc('day', NOW())",
                (client_key,)
            ).fetchone()["n"]
            if used >= limit:
                return jsonify({"error": "You have reached today’s creative allowance for your plan. Please come back after the daily reset."}), 429
            client = genai.Client(api_key=api_key)
            image_model = os.getenv("GEMINI_IMAGE_MODEL", "gemini-3.1-flash-image")
            response = client.models.generate_content(
                model=image_model,
                contents="Create one polished, high-quality image based on this prompt. Do not return only a description. Prompt: " + prompt,
                config=types.GenerateContentConfig(response_modalities=["TEXT", "IMAGE"])
            )
            image_part = next((part for part in response.parts if getattr(part, "inline_data", None)), None)
            if image_part is None:
                raise RuntimeError("The configured image model returned no image data.")
            image_data = base64.b64encode(image_part.inline_data.data).decode("ascii")
            mime_type = image_part.inline_data.mime_type or "image/png"
            conn.execute(
                "INSERT INTO usage_events(user_id,client_key) VALUES (%s,%s)",
                (user["id"], client_key)
            )
        return jsonify({"image": image_data, "mime_type": mime_type, "plan": user["plan"]})
    except Exception:
        app.logger.exception("Image generation failed")
        return jsonify({"error": "Image generation is unavailable right now. The Gemini image model may need to be enabled for this API key."}), 502


def configured_providers():
    providers = []
    if os.getenv("GEMINI_API_KEY"):
        providers.append({"id": "gemini", "name": "Google Gemini", "configured": True})
    if os.getenv("OPENAI_API_KEY"):
        providers.append({"id": "openai", "name": "OpenAI", "configured": True})
    if (os.getenv("CLOUDFLARE_API_TOKEN") or os.getenv("WORKERS_AI_API")) and os.getenv("CLOUDFLARE_ACCOUNT_ID"):
        providers.append({"id": "cloudflare", "name": "Cloudflare Workers AI", "configured": True})
    return providers

def call_ai_provider(provider, message, web_search=False, model_override=None, attachments=None):
    import json
    import urllib.request
    import urllib.error

    if provider == "gemini":
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise RuntimeError("Gemini API is not configured.")
        client = genai.Client(api_key=api_key)
        config_options = {"max_output_tokens": int(os.getenv("GEMINI_MAX_OUTPUT_TOKENS", "2048"))}
        if web_search:
            config_options["tools"] = [types.Tool(google_search=types.GoogleSearch())]
        config = types.GenerateContentConfig(**config_options)
        selected_model = (model_override or MODEL).strip()[:200]
        contents = message
        if attachments:
            contents = [types.Part.from_text(text=message)]
            for item in attachments:
                contents.append(types.Part.from_bytes(data=base64.b64decode(item["data"]), mime_type=item["mime_type"]))
        result = client.models.generate_content(model=selected_model, contents=contents, config=config)
        answer = (result.text or "").strip()
        if not answer:
            feedback = getattr(result, "prompt_feedback", None)
            candidates = getattr(result, "candidates", None) or []
            finish_reasons = [str(getattr(candidate, "finish_reason", "unknown")) for candidate in candidates]
            app.logger.error(
                "Gemini returned empty text; model=%s prompt_feedback=%s finish_reasons=%s",
                MODEL, str(feedback)[:500], ",".join(finish_reasons)[:300]
            )
        if web_search:
            sources = []
            try:
                for candidate in (getattr(result, "candidates", None) or []):
                    grounding = getattr(candidate, "grounding_metadata", None)
                    for chunk in (getattr(grounding, "grounding_chunks", None) or []):
                        web = getattr(chunk, "web", None)
                        uri = getattr(web, "uri", None)
                        title = getattr(web, "title", None) or uri
                        if uri and uri.startswith(("https://", "http://")) and uri not in [item[1] for item in sources]:
                            sources.append((str(title)[:180], uri))
            except Exception:
                app.logger.exception("Could not read Gemini grounding sources")
            if sources:
                answer += "\n\n## Sources\n" + "\n".join(
                    "- [" + title.replace("]", "") + "](" + uri + ")" for title, uri in sources[:8]
                )
        if not answer:
            raise RuntimeError("Gemini returned no text. Check prompt safety feedback, finish reason, model access and output-token settings.")
        return answer

    if provider == "openai":
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("OpenAI API is not configured.")
        payload = {
            "model": (model_override or os.getenv("OPENAI_MODEL", "gpt-4.1-mini")).strip()[:200],
            "input": message
        }
        req = urllib.request.Request(
            "https://api.openai.com/v1/responses",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Authorization": "Bearer " + api_key, "Content-Type": "application/json"},
            method="POST"
        )
        try:
            with urllib.request.urlopen(req, timeout=45) as response:
                data = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            app.logger.warning("OpenAI API returned HTTP %s", exc.code)
            raise RuntimeError("OpenAI request failed. Check its API key, model access and billing.")
        answer = str(data.get("output_text", "")).strip()
        if not answer:
            parts = []
            for item in data.get("output", []):
                for part in item.get("content", []):
                    if part.get("type") == "output_text":
                        parts.append(part.get("text", ""))
            answer = "\n".join(parts).strip()
        if not answer:
            raise RuntimeError("OpenAI returned an empty answer.")
        return answer

    if provider == "cloudflare":
        account_id = os.getenv("CLOUDFLARE_ACCOUNT_ID")
        api_token = os.getenv("CLOUDFLARE_API_TOKEN") or os.getenv("WORKERS_AI_API")
        if not account_id or not api_token:
            raise RuntimeError("Cloudflare Workers AI is not configured.")
        model = (model_override or os.getenv("CLOUDFLARE_AI_MODEL", "@cf/meta/llama-3.1-8b-instruct")).strip()[:200]
        url = "https://api.cloudflare.com/client/v4/accounts/" + account_id + "/ai/run/" + model
        payload = {"messages": [{"role": "user", "content": message}]}
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Authorization": "Bearer " + api_token, "Content-Type": "application/json"},
            method="POST"
        )
        try:
            with urllib.request.urlopen(req, timeout=45) as response:
                data = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            app.logger.warning("Cloudflare Workers AI returned HTTP %s", exc.code)
            raise RuntimeError("Cloudflare AI request failed. Check token permissions, model access and credits.")
        result = data.get("result") or {}
        answer = str(result.get("response", "")).strip()
        if not answer:
            raise RuntimeError("Cloudflare AI returned an empty answer.")
        return answer

    raise RuntimeError("Unknown AI provider.")

@app.route("/api/providers", methods=["GET", "OPTIONS"])
def providers_status():
    if request.method == "OPTIONS":
        return "", 204
    return jsonify({"providers": configured_providers(), "default_model": MODEL})

@app.route("/api/test-model", methods=["POST", "OPTIONS"])
def test_model_connection():
    if request.method == "OPTIONS":
        return "", 204
    user = current_user()
    if not user:
        return jsonify({"error": "Sign in before testing the AI connection.", "code": "AUTH_REQUIRED"}), 401
    data = request.get_json(silent=True) or {}
    requested = str(data.get("provider", "auto")).lower()
    requested_model = str(data.get("model", "")).strip()[:200] or None
    available = [item["id"] for item in configured_providers()]
    if requested == "auto":
        if requested_model:
            lower_model = requested_model.lower()
            if lower_model.startswith("@cf/"):
                provider = "cloudflare"
            elif lower_model.startswith("gemini-"):
                provider = "gemini"
            elif lower_model.startswith(("gpt-", "o1", "o3", "o4", "chatgpt-")):
                provider = "openai"
            else:
                return jsonify({"ok": False, "error": "Select the provider for this custom model ID."}), 400
        else:
            provider = next((p for p in ("cloudflare", "gemini") if p in available), None)
    elif requested == "compare":
        provider = next((p for p in ("cloudflare", "gemini") if p in available), None)
    else:
        provider = requested
    if provider not in {"gemini", "openai", "cloudflare"} or provider not in available:
        return jsonify({"ok": False, "error": "The selected AI engine is not configured on the server. Auto mode only tests configured free-first providers."}), 503
    started = time.monotonic()
    try:
        answer = call_ai_provider(provider, "Reply with exactly: DexAI model connection successful.", model_override=requested_model)
        if not answer.strip():
            raise RuntimeError("The provider returned an empty test response.")
        elapsed_ms = int((time.monotonic() - started) * 1000)
        app.logger.info("AI connection test passed provider=%s elapsed_ms=%s user_id=%s", provider, elapsed_ms, user["id"])
        return jsonify({"ok": True, "provider": provider, "model": requested_model or (MODEL if provider == "gemini" else None), "elapsed_ms": elapsed_ms, "message": "AI connection successful."})
    except Exception:
        app.logger.exception("AI connection test failed provider=%s user_id=%s", provider, user["id"])
        return jsonify({"ok": False, "provider": provider, "error": "AI connection test failed. Check server logs, provider credentials, model access, quota and billing."}), 502

@app.route("/api/chat", methods=["POST", "OPTIONS"])
def chat():
    if request.method == "OPTIONS":
        return "", 204
    user = current_user()
    if not user:
        return jsonify({"error": "Please sign in or create a DexAI account before chatting.", "code": "AUTH_REQUIRED"}), 401

    data = request.get_json(silent=True) or {}
    message = str(data.get("message", "")).strip()
    attachments = data.get("attachments", []) or []
    provider = str(data.get("provider", "auto")).lower()
    web_search = bool(data.get("web_search", False))
    requested_model = str(data.get("model", "")).strip()[:200] or None
    if not message:
        return jsonify({"error": "Please enter a message."}), 400
    if len(message) > MAX_MESSAGE_LENGTH:
        return jsonify({"error": "Message is too long (maximum 4000 characters)."}), 413
    if provider not in {"auto", "compare", "gemini", "openai", "cloudflare"}:
        return jsonify({"error": "Choose a supported AI provider."}), 400
    if not isinstance(attachments, list) or len(attachments) > 3:
        return jsonify({"error": "Attach up to 3 files per message."}), 400
    total_attachment_bytes = 0
    for item in attachments:
        if not isinstance(item, dict):
            return jsonify({"error": "Invalid attachment format."}), 400
        mime_type = str(item.get("mime_type", ""))
        encoded = str(item.get("data", ""))
        allowed = mime_type.startswith("image/") or mime_type in {"video/mp4", "video/webm", "application/pdf", "text/plain"}
        if not allowed:
            return jsonify({"error": "Supported files: images, MP4/WebM videos, PDFs and plain text."}), 415
        try:
            raw = base64.b64decode(encoded, validate=True)
        except Exception:
            return jsonify({"error": "An attachment could not be read. Please choose it again."}), 400
        total_attachment_bytes += len(raw)
        if len(raw) > 18 * 1024 * 1024:
            return jsonify({"error": "Each attachment must be 18 MB or smaller."}), 413
    if total_attachment_bytes > 18 * 1024 * 1024:
        return jsonify({"error": "Total attachments must be 18 MB or smaller per message."}), 413

    available = [item["id"] for item in configured_providers()]
    if not available:
        return jsonify({"error": "No AI provider is configured on the server yet."}), 503
    if attachments:
        if "gemini" not in available:
            return jsonify({"error": "File analysis currently needs Gemini to be configured on the server. Try again after its quota resets."}), 503
        if requested_model and not requested_model.lower().startswith("gemini-"):
            return jsonify({"error": "File analysis currently uses Gemini. Clear the custom model ID or choose a Gemini model."}), 400
        selected = ["gemini"]
    elif web_search:
        if "gemini" not in available:
            return jsonify({"error": "Web search needs the Gemini engine to be connected."}), 503
        if requested_model and not requested_model.lower().startswith("gemini-"):
            return jsonify({"error": "Web search currently uses Gemini. Choose a Gemini model or clear the custom model ID."}), 400
        selected = ["gemini"]
    elif provider == "compare":
        if requested_model:
            return jsonify({"error": "Choose one AI provider when using a custom model ID; model names are provider-specific."}), 400
        selected = available
    elif provider == "auto":
        # Respect a typed model ID without silently switching providers or spending on OpenAI.
        if requested_model:
            lower_model = requested_model.lower()
            if lower_model.startswith("@cf/"):
                preferred = "cloudflare"
            elif lower_model.startswith("gemini-"):
                preferred = "gemini"
            elif lower_model.startswith(("gpt-", "o1", "o3", "o4", "chatgpt-")):
                preferred = "openai"
            else:
                return jsonify({"error": "This custom model ID does not identify its provider. Select the matching AI engine in Model settings."}), 400
            if preferred not in available:
                return jsonify({"error": "The provider for this model ID is not configured on the server. Check its API credentials in Render Environment."}), 503
            selected = [preferred]
        else:
            # Free-first auto mode: never silently spend on OpenAI API.
            selected = [p for p in ("cloudflare", "gemini") if p in available]
            if not selected:
                return jsonify({"error": "No free AI provider is available right now. Configure Cloudflare Workers AI or wait for Gemini quota to reset. OpenAI API is only used when selected explicitly."}), 503
    elif provider in available:
        selected = [provider]
    else:
        return jsonify({"error": "That AI provider is not connected yet. Add its API credentials in Render Environment first.", "provider": provider}), 503

    client_key = "user:" + user["id"]
    limit = plan_limit(user["plan"])
    try:
        init_db()
        with db() as conn:
            usage = conn.execute(
                "SELECT COUNT(*) AS n FROM usage_events WHERE client_key=%s AND created_at >= date_trunc('day', NOW())",
                (client_key,)
            ).fetchone()["n"]
            if usage >= limit:
                return jsonify({"error": "You have reached today’s message allowance for your plan. Please come back after the daily reset.", "plan": user["plan"]}), 429

            # Lightweight conversation memory: reuse recent turns without another AI call.
            recent_rows = conn.execute(
                "SELECT role,content FROM conversations WHERE user_id=%s ORDER BY id DESC LIMIT 8",
                (user["id"],)
            ).fetchall()
            recent_rows = list(reversed(recent_rows))
            if recent_rows:
                memory_context = "\n".join(
                    ("User: " if row["role"] == "user" else "DexAI: ") + row["content"][:1200]
                    for row in recent_rows
                )
                prompt_message = (
                    "You are DexAI, a helpful, accurate assistant. Respond quickly and directly. "
                    "Start with the answer, keep simple answers short, use headings or bullets only when useful, "
                    "and ask a follow-up only if essential. Use context for continuity, but never invent facts.\n\n"
                    "Recent conversation context:\n" + memory_context + "\n\nCurrent user message:\n" + message
                )
            else:
                prompt_message = (
                    "You are DexAI, a helpful, accurate assistant. Respond quickly and directly. "
                    "Start with the answer, keep simple answers short, use headings or bullets only when useful, "
                    "and ask a follow-up only if essential. Never invent facts.\n\nUser: " + message
                )
            attachment_fingerprint = hashlib.sha256("".join(hashlib.sha256(base64.b64decode(item["data"])).hexdigest() for item in attachments).encode()).hexdigest() if attachments else ""
            cache_key = hashlib.sha256((client_key + "\n" + provider + "\n" + str(web_search) + "\n" + str(requested_model or "") + "\n" + message + "\n" + attachment_fingerprint).encode()).hexdigest()
            cached = conn.execute(
                "SELECT response FROM ai_cache WHERE cache_key=%s AND expires_at > NOW()",
                (cache_key,)
            ).fetchone()
            if cached:
                answer = cached["response"]
                results = [{"provider": provider, "name": "Cached answer", "reply": answer, "ok": True}]
            else:
                from concurrent.futures import ThreadPoolExecutor, as_completed
                labels = {"gemini": "Google Gemini", "openai": "OpenAI", "cloudflare": "Cloudflare Workers AI"}
                results = []
                auto_fallback = provider == "auto" and not web_search and not requested_model
                if len(selected) == 1 or auto_fallback:
                    for p in selected:
                        try:
                            reply = call_ai_provider(
                                p, prompt_message,
                                web_search=web_search and p == "gemini",
                                model_override=requested_model if len(selected) == 1 else None,
                                attachments=attachments if p == "gemini" else None
                            )
                            results.append({"provider": p, "name": labels[p], "reply": reply, "ok": True})
                            if auto_fallback:
                                break
                        except Exception as exc:
                            app.logger.exception("AI provider call failed provider=%s user_id=%s", p, user["id"])
                            results.append({"provider": p, "name": labels[p], "reply": str(exc), "ok": False})
                            if not auto_fallback:
                                break
                else:
                    with ThreadPoolExecutor(max_workers=len(selected)) as pool:
                        futures = {pool.submit(call_ai_provider, p, prompt_message, web_search=web_search and p == "gemini", attachments=attachments if p == "gemini" else None): p for p in selected}
                        for future in as_completed(futures):
                            p = futures[future]
                            try:
                                results.append({"provider": p, "name": labels[p], "reply": future.result(), "ok": True})
                            except Exception as exc:
                                app.logger.exception("AI provider call failed provider=%s user_id=%s", p, user["id"])
                                results.append({"provider": p, "name": labels[p], "reply": str(exc), "ok": False})
                    results.sort(key=lambda item: selected.index(item["provider"]))
                successes = [r for r in results if r["ok"]]
                if not successes:
                    safe_errors = " ".join(r["name"] + ": " + r["reply"] for r in results)
                    friendly_errors = []
                    for item in results:
                        if item["ok"]:
                            continue
                        detail = str(item.get("reply", ""))
                        if item["provider"] == "gemini" and ("429" in detail or "RESOURCE_EXHAUSTED" in detail or "quota" in detail.lower()):
                            import re
                            match = re.search(r"retry in ([0-9hms.]+)", detail, re.IGNORECASE)
                            wait_text = ""
                            if match:
                                delay = match.group(1)
                                hours = re.search(r"(\d+)h", delay)
                                minutes = re.search(r"(\d+)m", delay)
                                if hours and int(hours.group(1)) > 0:
                                    wait_text = " Please try again in about " + hours.group(1) + " hour(s)."
                                elif minutes:
                                    wait_text = " Please try again in about " + minutes.group(1) + " minute(s)."
                            friendly_errors.append("You're temporarily out of Gemini messages." + (wait_text or " Please try again after your quota resets."))
                        elif item["provider"] == "cloudflare":
                            friendly_errors.append("Cloudflare AI couldn't respond. Please check its connection and try again.")
                        else:
                            friendly_errors.append("AI is temporarily unavailable. Please try again later.")
                    return jsonify({"error": " ".join(friendly_errors) or "AI is temporarily unavailable. Please try again later."}), 502
                if len(selected) == 1:
                    answer = successes[0]["reply"]
                else:
                    answer = "\n\n".join("## " + r["name"] + ("\n\n" + r["reply"] if r["ok"] else "\n\n*Unavailable: " + r["reply"] + "*") for r in results)
                conn.execute(
                    "INSERT INTO ai_cache(cache_key,response,expires_at) VALUES (%s,%s,NOW() + (%s * INTERVAL '1 second')) ON CONFLICT(cache_key) DO UPDATE SET response=EXCLUDED.response, expires_at=EXCLUDED.expires_at",
                    (cache_key, answer, CACHE_TTL_SECONDS)
                )

            conn.execute(
                "INSERT INTO usage_events(user_id,client_key) VALUES (%s,%s)",
                (user["id"], client_key)
            )
            conn.execute(
                "INSERT INTO conversations(user_id,role,content) VALUES (%s,'user',%s),(%s,'assistant',%s)",
                (user["id"], message, user["id"], answer)
            )
            conn.execute("DELETE FROM ai_cache WHERE expires_at <= NOW()")
        return jsonify({
            "reply": answer,
            "results": results,
            "provider": provider,
            "cached": bool(cached),
            "plan": user["plan"]
        })
    except Exception:
        app.logger.exception("AI request failed")
        return jsonify({"error": "AI request failed. Check database configuration and the selected provider credentials."}), 502

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", 10000)))
