# Infogrid Tracker — other device setup

Repo: https://github.com/hassiddarth-cpu/infogridai

## On the other Mac / laptop

### 1. Get the code
```bash
git clone https://github.com/hassiddarth-cpu/infogridai.git
cd infogridai
```
(If private: log into GitHub, or use your token as the git password.)

### 2. Open in Cursor
Open the `infogridai` folder.

### 3. Paste this short line in Cursor chat
```
Read CURSOR-PROMPT.txt and do everything in it. Walk me through free Firebase + free hosting until CLOUD LIVE, then push any doc updates to git.
```
(Same short line is in `SAY-THIS.txt`. Full instructions are in `CURSOR-PROMPT.txt`.)

### Full prompt (optional — if you prefer pasting everything)
Also in `ONE-PROMPT.txt` / `CURSOR-PROMPT.txt`.

```
You are setting up Infogrid AI Sprint Tracker for TWO people (Varsha 24 + Siddharth 25) on DIFFERENT devices using ONLY free tools.

Project is static: index.html, styles.css, app.js. Read .cursor/rules/infogrid-sprint.mdc and follow it.

GOAL: Both use the same public URL and sync via Firebase even when any laptop is off. No paid plans.

Do this end-to-end:
1. Confirm Sync / cloud gate / Netlify + Firebase free flow works.
2. Start ./start.sh or python3 -m http.server 8765 and open http://127.0.0.1:8765
3. Walk me through:
   A) Firebase Spark → Realtime Database test mode → web firebaseConfig
   B) Sync tab: vault infogrid-sprint + config → Connect → CLOUD LIVE
   C) Save cloud-config.json in project root
   D) Free public URL: Netlify Drop WHOLE folder → Claim with FREE account (no card; unclaimed = 1 hour only) OR GitHub Pages
4. Checklist for device 2: open public URL → CLOUD LIVE → clock in → log calls → clock out
5. Fix bugs if needed; keep static HTML/CSS/JS; blue/pink theme; 200-call goal; clock-in/out.

Reply with: Public URL, vault code, confirmation free Firebase+hosting connected, steps for device 2.
```

## Free hosting (no pay)

| Problem | Fix |
|---------|-----|
| Site dies in 1 hour | You did **not** claim it. Sign up free Netlify → **Claim this site** |
| Asks for money | Stay on **Starter / free**. Never enter a card |
| Can’t upload full project | Drag the **folder**, not one file. Or use GitHub Pages from this repo |

## After cloud is set (both devices)

| Step | What to do |
|------|------------|
| 1 | Open the **public URL** (Netlify or GitHub Pages — not only localhost) |
| 2 | Status should show **CLOUD LIVE** |
| 3 | Same vault: `infogrid-sprint` |
| 4 | **Clock in** → log cold calls → **Clock out** |

## Shortcut if Mac #1 already finished hosting + Firebase

Other device only needs:
1. Open the public link
2. If asked, paste the invite / connect once
3. Start logging
