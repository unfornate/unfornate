#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"
PORT=8888
python3 -m http.server "$PORT" >/dev/null 2>&1 &
PID=$!
sleep 2
if command -v open >/dev/null 2>&1; then
  open "http://127.0.0.1:${PORT}/index.html"
fi
wait $PID
