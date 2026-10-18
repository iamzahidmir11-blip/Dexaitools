import os
import time
import hashlib
from datetime import datetime, timedelta, timezone
from functools import wraps

import jwt
import psycopg
from psycopg.rows import dict_row
from flask import Flask, request, jsonify, g, send_from_directory
from werkzeug.security import generate_password_hash, check_password_hash
from google import genai

app = Flask(__name__)
ORIGIN = os.getenv("FRONTEND_ORIGIN", "https://iamzahidmir11-blip.github.io")
MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
FREE_DAILY_LIMIT = int(os.getenv("FREE_DAILY_LIMIT", "10"))
GUEST_DAILY_LIMIT = int(os.getenv("GUEST_DAILY_LIMIT", "3"))
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
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
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
def health():
    status = {"service": "online", "database": "not_configured"}
    try:
        init_db()
        status["database"] = "connected"
    except Exception:
        status["database"] = "unavailable"
    return jsonify(status), (200 if status["database"] == "connected" else 503)

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
        limit = int(os.getenv("PREMIUM_DAILY_LIMIT", "100")) if user["plan"] == "premium" else FREE_DAILY_LIMIT
        client_key = "user:" + user["id"]
        with db() as conn:
            used = conn.execute(
                "SELECT COUNT(*) AS n FROM usage_events WHERE client_key=%s AND created_at >= date_trunc('day', NOW())",
                (client_key,)
            ).fetchone()["n"]
        return jsonify({"plan": user["plan"], "daily_limit": limit, "used": used, "remaining": max(0, limit - used)})
    except Exception:
        app.logger.exception("Usage lookup failed")
        return jsonify({"error": "Usage information is temporarily unavailable."}), 503

@app.route("/api/chat", methods=["POST", "OPTIONS"])
def chat():
    if request.method == "OPTIONS":
        return "", 204
    user = current_user()
    if not user:
        return jsonify({"error": "Please sign in or create a DexAI account before chatting.", "code": "AUTH_REQUIRED"}), 401

    data = request.get_json(silent=True) or {}
    message = str(data.get("message", "")).strip()
    if not message:
        return jsonify({"error": "Please enter a message."}), 400
    if len(message) > MAX_MESSAGE_LENGTH:
        return jsonify({"error": "Message is too long (maximum 4000 characters)."}), 413

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return jsonify({"error": "AI configuration is incomplete."}), 503

    client_key = "user:" + user["id"]
    limit = int(os.getenv("PREMIUM_DAILY_LIMIT", "100")) if user["plan"] == "premium" else FREE_DAILY_LIMIT
    try:
        init_db()
        with db() as conn:
            usage = conn.execute(
                "SELECT COUNT(*) AS n FROM usage_events WHERE client_key=%s AND created_at >= date_trunc('day', NOW())",
                (client_key,)
            ).fetchone()["n"]
            if usage >= limit:
                return jsonify({"error": f"Daily limit reached ({limit} messages). Your limit resets at midnight UTC.", "remaining": 0, "plan": user["plan"]}), 429

            cache_key = hashlib.sha256((client_key + "\\n" + message).encode()).hexdigest()
            cached = conn.execute(
                "SELECT response FROM ai_cache WHERE cache_key=%s AND expires_at > NOW()",
                (cache_key,)
            ).fetchone()
            if cached:
                answer = cached["response"]
            else:
                client = genai.Client(api_key=api_key)
                result = client.models.generate_content(model=MODEL, contents=message)
                answer = (result.text or "").strip() or "Please try asking another question."
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
            "cached": bool(cached),
            "remaining": max(0, limit - usage - 1),
            "daily_limit": limit,
            "plan": user["plan"]
        })
    except Exception:
        app.logger.exception("AI request failed")
        return jsonify({"error": "AI request failed. Check database and Gemini configuration, then try again."}), 502

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", 10000)))
