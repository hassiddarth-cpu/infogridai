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

Hosted on **GitHub Pages** (deploy from branch `main` / root).

`cloud-config.json` is in the repo so both devices auto-connect (**CLOUD LIVE**) from the public URL. Firebase web config is public-by-design.

### One-time (you click — ~30 seconds)
1. Open https://github.com/hassiddarth-cpu/infogridai/settings/pages
2. **Build and deployment → Source:** Deploy from a branch
3. **Branch:** `main` · folder **`/ (root)`** → **Save**
4. Wait 1–2 min, then open the URL above
