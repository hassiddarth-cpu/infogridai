# Infogrid Tracker

Shared sprint tracker for **Infogrid AI** — Varsha & Siddharth.

## Features
- Daily cold-call logging (connected, busy, voicemail, failed, gatekeeper + area)
- Clock in / clock out with live hours
- 200-call pace, month grid, analytics, goals
- Free multi-device sync: Firebase Spark + Firebase Hosting (or GitHub Pages if repo is public)

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

**Private repo?** GitHub Pages needs a **public** repo on the free plan. Use **Firebase Hosting** instead (Spark / free — you already have the project).

### Firebase Hosting (recommended)
**Public URL after deploy:** `https://infogrid-dd53b.web.app`

One-time in Terminal:
```bash
cd infogridai
npm install -g firebase-tools
firebase login
firebase deploy --only hosting
```

`cloud-config.json` is deployed with the site — both devices get **CLOUD LIVE** automatically.

### GitHub Pages (only if repo is public)
1. Settings → General → **Change visibility → Public**
2. Settings → Pages → branch `main` / root → Save
3. URL: https://hassiddarth-cpu.github.io/infogridai/
