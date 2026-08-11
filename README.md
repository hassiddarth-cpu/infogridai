# Infogrid Tracker

Shared sprint tracker for **Infogrid AI** — Varsha & Siddharth.

## Features
- Daily cold-call logging (connected, busy, voicemail, failed, gatekeeper + area)
- Clock in / clock out with live hours
- 200-call pace, month grid, analytics, goals
- Free multi-device sync: Netlify Drop + Firebase Spark

## Local run
```bash
./start.sh
# open http://127.0.0.1:8765
```

## Other device (clone from Git)
See **[OTHER-DEVICE.md](./OTHER-DEVICE.md)**.

```bash
git clone https://github.com/hassiddarth-cpu/infogridai.git
cd infogridai
```

Open folder in Cursor, then paste:

```
Read CURSOR-PROMPT.txt and do everything in it. Walk me through free Firebase + free hosting until CLOUD LIVE, then push any doc updates to git.
```

(`SAY-THIS.txt` = short line · `CURSOR-PROMPT.txt` = full instructions)

## Deploy (free — no credit card)

**Public URL:** https://hassiddarth-cpu.github.io/infogridai/

Hosted on **GitHub Pages** via `.github/workflows/pages.yml` (auto-deploy on push to `main`).

`cloud-config.json` is in the repo so both devices auto-connect (**CLOUD LIVE**) from the public URL. Firebase web config is public-by-design.

### One-time (if Pages not live yet)
1. Repo → **Settings** → **Pages**
2. **Build and deployment → Source:** **GitHub Actions**
3. Push to `main` (or re-run the **Deploy to GitHub Pages** workflow)

Sync uses **Firebase Spark** (free). Netlify Drop is optional if your account works.
