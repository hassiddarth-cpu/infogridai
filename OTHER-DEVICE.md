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

### 3. Paste this prompt in Cursor chat
(Same content as below — also in `ONE-PROMPT.txt`.)

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
   D) Netlify Drop deploy of whole folder → give public URL
4. Checklist for device 2: open Netlify URL → CLOUD LIVE → clock in → log calls → clock out
5. Fix bugs if needed; keep static HTML/CSS/JS; blue/pink theme; 200-call goal; clock-in/out.

Reply with: Public URL, vault code, confirmation free Firebase+Netlify connected, steps for device 2.
```

## After cloud is set (both devices)

| Step | What to do |
|------|------------|
| 1 | Open the **Netlify URL** (not only localhost) |
| 2 | Status should show **CLOUD LIVE** |
| 3 | Same vault: `infogrid-sprint` |
| 4 | **Clock in** → log cold calls → **Clock out** |

## Shortcut if Mac #1 already finished Netlify + Firebase

Other device only needs:
1. Open the Netlify link
2. If asked, paste the invite / connect once
3. Start logging
