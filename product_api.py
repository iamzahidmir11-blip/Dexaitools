import os
import re
import smtplib
import sqlite3
from contextlib import contextmanager
from datetime import datetime
from email.message import EmailMessage
from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 20 * 1024
SITE_ORIGIN = os.getenv("SITE_ORIGIN", "https://iamzahidmir11-blip.github.io").rstrip("/")
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "").strip()
LOCAL_DB = os.getenv("LOCAL_DB_PATH", "product_leads.sqlite3")
CORS(app, resources={r"/api/*": {"origins": [SITE_ORIGIN, "http://127.0.0.1:5500", "http://localhost:5500"]}})

def connect_db():
    if DATABASE_URL:
        import psycopg
        from psycopg.rows import dict_row
        url = DATABASE_URL.replace("postgres://", "postgresql://", 1)
        return psycopg.connect(url, row_factory=dict_row)
    conn = sqlite3.connect(LOCAL_DB)
    conn.row_factory = sqlite3.Row
    return conn

@contextmanager
def db_session():
    conn = connect_db()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def init_db():
    with db_session() as conn:
        if DATABASE_URL:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS leads (
                    id BIGSERIAL PRIMARY KEY,
                    name VARCHAR(120) NOT NULL,
                    email VARCHAR(254) NOT NULL,
                    business VARCHAR(160) NOT NULL DEFAULT '',
                    budget VARCHAR(80) NOT NULL DEFAULT '',
                    project_type VARCHAR(120) NOT NULL DEFAULT '',
                    message TEXT NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
            """)
        else:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS leads (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    email TEXT NOT NULL,
                    business TEXT NOT NULL DEFAULT '',
                    budget TEXT NOT NULL DEFAULT '',
                    project_type TEXT NOT NULL DEFAULT '',
                    message TEXT NOT NULL,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
            """)

def clean(value, limit):
    return " ".join(str(value or "").strip().split())[:limit]

def notify_owner(lead):
    host = os.getenv("SMTP_HOST", "").strip()
    user = os.getenv("SMTP_USER", "").strip()
    password = os.getenv("SMTP_PASSWORD", "")
    recipient = os.getenv("LEAD_NOTIFY_EMAIL", "zahidmirstudio@gmail.com").strip()
    if not (host and user and password and recipient):
        return False
    msg = EmailMessage()
    msg["Subject"] = "New website enquiry — " + lead["name"]
    msg["From"] = os.getenv("SMTP_FROM", user)
    msg["To"] = recipient
    msg.set_content(
        "New enquiry received on Zahid Mir Studio.\n\n"
        f"Name: {lead['name']}\nEmail: {lead['email']}\n"
        f"Business: {lead['business'] or 'Not provided'}\n"
        f"Budget: {lead['budget'] or 'Not provided'}\n"
        f"Project: {lead['project_type'] or 'Not provided'}\n\n"
        f"Message:\n{lead['message']}\n"
    )
    port = int(os.getenv("SMTP_PORT", "587"))
    with smtplib.SMTP(host, port, timeout=10) as server:
        server.starttls()
        server.login(user, password)
        server.send_message(msg)
    return True

@app.get("/")
def home():
    return jsonify({"service": "Zahid Mir Studio Leads API", "status": "online"})

@app.get("/health")
def health():
    try:
        with db_session() as conn:
            conn.execute("SELECT 1")
        return jsonify({"status": "ok", "database": "connected"})
    except Exception:
        app.logger.exception("Health/database check failed")
        return jsonify({"status": "degraded", "database": "unavailable"}), 503

@app.post("/api/leads")
def create_lead():
    data = request.get_json(silent=True) or request.form
    # Honeypot field: bots may fill it; silently accept without storing.
    if clean(data.get("website"), 200):
        return jsonify({"ok": True, "message": "Enquiry received."}), 201
    name = clean(data.get("name"), 120)
    email = clean(data.get("email"), 254).lower()
    business = clean(data.get("business"), 160)
    budget = clean(data.get("budget"), 80)
    project_type = clean(data.get("project_type") or data.get("package"), 120)
    message = str(data.get("message") or "").strip()[:5000]
    if len(name) < 2:
        return jsonify({"ok": False, "error": "Please enter your name."}), 400
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        return jsonify({"ok": False, "error": "Please enter a valid email address."}), 400
    if len(message) < 10:
        return jsonify({"ok": False, "error": "Please add a little more detail about the project."}), 400
    lead = {"name": name, "email": email, "business": business, "budget": budget,
            "project_type": project_type, "message": message}
    try:
        placeholder = "%s" if DATABASE_URL else "?"
        with connect_db() as conn:
            conn.execute(
                "INSERT INTO leads (name,email,business,budget,project_type,message) VALUES (" +
                ",".join([placeholder] * 6) + ")",
                (name, email, business, budget, project_type, message)
            )
        emailed = False
        try:
            emailed = notify_owner(lead)
        except Exception:
            app.logger.exception("Lead saved, but email notification failed")
        return jsonify({"ok": True, "message": "Your enquiry has been saved securely.",
                        "email_notification": "sent" if emailed else "not_configured"}), 201
    except Exception:
        app.logger.exception("Unable to save lead")
        return jsonify({"ok": False, "error": "We couldn't save your enquiry right now. Please try again shortly."}), 503

@app.get("/api/leads")
def list_leads():
    if not ADMIN_TOKEN:
        return jsonify({"error": "Admin access is not configured."}), 503
    supplied = request.headers.get("Authorization", "")
    if supplied != "Bearer " + ADMIN_TOKEN:
        return jsonify({"error": "Unauthorized."}), 401
    try:
        with connect_db() as conn:
            rows = conn.execute(
                "SELECT id,name,email,business,budget,project_type,message,created_at "
                "FROM leads ORDER BY id DESC LIMIT 100"
            ).fetchall()
        leads = [dict(row) for row in rows]
        for row in leads:
            for key, value in row.items():
                if isinstance(value, datetime):
                    row[key] = value.isoformat()
        return jsonify({"leads": leads, "count": len(leads)})
    except Exception:
        app.logger.exception("Unable to read leads")
        return jsonify({"error": "Could not read leads."}), 503

with app.app_context():
    try:
        init_db()
    except Exception:
        app.logger.exception("Database initialization failed")
