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
See **[OTHER-DEVICE.md](./OTHER-DEVICE.md)** — clone, open in Cursor, paste `ONE-PROMPT.txt`.

```bash
git clone https://github.com/hassiddarth-cpu/infogridai.git
cd infogridai
```

## Deploy (free)
1. Drag this folder to [Netlify Drop](https://app.netlify.com/drop)
2. Connect Firebase Realtime Database (Spark / free) in the **Sync** tab
3. Share the Netlify URL with both devices
