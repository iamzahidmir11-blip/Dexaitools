# CumuloMind AI on Android Termux

This runs the repository's existing Flask backend and serves its `index.html` frontend from your Android phone. It uses a local PostgreSQL database and Gemini for AI replies. Keep API keys private.

## 1. Install Termux prerequisites

Install Termux from a trusted source, open it, then run:

```bash
pkg update && pkg upgrade -y
pkg install -y git python clang make postgresql openssl libffi
```

## 2. Download the complete project

```bash
cd ~
git clone https://github.com/iamzahidmir11-blip/Dexaitools.git
cd Dexaitools
```

If you already cloned it, update it instead:

```bash
cd ~/Dexaitools
git pull
```

## 3. Start a local PostgreSQL database

Initialize the database directory once:

```bash
mkdir -p "$PREFIX/var/lib/postgresql"
initdb -D "$PREFIX/var/lib/postgresql"
```

If `initdb` says the directory is already initialized, do not initialize it again.

Start PostgreSQL:

```bash
pg_ctl -D "$PREFIX/var/lib/postgresql" -l "$PREFIX/var/lib/postgresql/logfile" start
```

Create a database user and database. Replace `CHOOSE_A_PASSWORD` with your own password; remember it for the next step:

```bash
createuser -P cumulo
createdb -O cumulo cumulomind
```

If the user/database already exists, don't recreate it. Use the existing credentials.

## 4. Install Python packages

Use the Termux-specific requirements because Android does not always have the prebuilt `psycopg-binary` wheel used by the hosted deployment:

```bash
python -m venv .venv
source .venv/bin/activate
export PSYCOPG_IMPL=python
python -m pip install --upgrade setuptools wheel
python -m pip install -r requirements-termux.txt
```

If package installation fails, copy the complete error text before retrying.

## 5. Configure secrets

```bash
cp .env.termux.example .env
nano .env
``

Replace:
- `PASTE_YOUR_GEMINI_API_KEY_HERE` with your own Gemini API key.
- The database password in `DATABASE_URL` with the password set in step 3.
- `REPLACE_WITH_A_LONG_RANDOM_SECRET` with a long random secret.

Keep `GEMINI_MODEL=gemini-2.5-flash`. Get your Gemini key from Google's official AI Studio. Never put the key in `index.html`, GitHub, screenshots, or messages.

Save nano with **Ctrl+O**, Enter, then **Ctrl+X**.

## 6. Run the server

```bash
chmod +x run_termux.sh
./run_termux.sh
```

Open this on the same phone:

**http://127.0.0.1:5000**

The Flask app serves the frontend and its `/api/...` requests on the same local server. Leave Termux running while using the app. Android may stop background processes, so keep Termux in the foreground while testing.

## 7. Test a reply

Create/sign into an account in the app, then send:

`Reply with exactly: CumuloMind AI is working.`

If the app reports a database, login, or Gemini error, copy the full Termux traceback/error text. A server starting successfully alone does not prove that AI replies are working.

## Notes

- This is a **local phone server**. `127.0.0.1` works only on the same phone; it is not automatically public on the internet.
- Local chat history/accounts live in this phone's PostgreSQL database, separate from the hosted Render database.
- Billing/Stripe features may require additional Stripe credentials and public webhook setup.
- Never paste your `.env` file or API key into chat or upload it to GitHub.
