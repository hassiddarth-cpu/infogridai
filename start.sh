#!/bin/bash
cd "$(dirname "$0")"
echo "J.A.R.V.I.S. Sprint OS → http://127.0.0.1:8765"
echo "Open this URL on this Mac. Copy the folder to the other Mac and run ./start.sh there too."
echo "Then connect both to the same Firebase vault in Cloud Sync."
python3 -m http.server 8765
