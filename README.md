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

## Deploy (free forever — no credit card)

**Important:** Netlify Drop without an account dies after **1 hour**. That is not a paid wall — sign up free and **Claim this site**.

### Option A — Netlify (easiest)
1. Go to [app.netlify.com/drop](https://app.netlify.com/drop)
2. Drag the **whole folder** (`infogridai`), not only `index.html`
3. Click **Claim this site** → **Sign up for free** (Starter plan — no payment)
4. Bookmark the public URL (e.g. `https://something.netlify.app`)
5. Connect Firebase in the app **Sync** tab (Spark / free)

### Option B — GitHub Pages (also free)
1. Repo → **Settings** → **Pages** → Source: **Deploy from a branch**
2. Branch: `main` / folder: `/ (root)` → Save
3. URL: `https://hassiddarth-cpu.github.io/infogridai/` (if repo is public)

Sync still uses **Firebase Spark** (free). Hosting is only the public URL.
