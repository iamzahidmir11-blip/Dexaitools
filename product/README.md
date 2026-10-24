# Zahid Mir Studio website

The portfolio and enquiry form live in this folder. The enquiry API is part of the existing Render backend at `https://dexaitools.onrender.com` and uses the existing PostgreSQL database with a separate `studio_leads` table.

## Enquiry API
- `POST /api/studio/leads` — validates and stores project enquiries.
- `GET /api/studio/leads` — protected endpoint for the latest 100 enquiries; requires `Authorization: Bearer <STUDIO_ADMIN_TOKEN>`.
- Lead notification email is optional and requires SMTP environment variables on Render.

## Render setup
1. Wait for the existing `Dexaitools` Render service to deploy the latest commit.
2. Open `https://dexaitools.onrender.com/health` and check the database is connected.
3. In Render → Dexaitools → Environment, set a strong private `STUDIO_ADMIN_TOKEN`. Do not put this token in frontend code or GitHub.
4. Optional email alerts: set `LEAD_NOTIFY_EMAIL=zahidmirstudio@gmail.com`, `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER=zahidmirstudio@gmail.com`, `SMTP_PASSWORD` to a Google App Password, and `SMTP_FROM=zahidmirstudio@gmail.com`. Never share passwords or app passwords in chat or commit them to GitHub.
5. Submit a test enquiry and verify it is saved before promoting the site.

## Database note
The studio leads table shares the existing CumuloMind PostgreSQL instance but uses a separate table. The current Render free database is listed as expiring on **17 November 2026**; export/back up the data and choose a durable database plan before that date. Check current Render pricing before upgrading.
