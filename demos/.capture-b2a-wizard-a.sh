#!/bin/bash
# Demo capture for B2a-wizard-A
# Captures multiple frames of the running app showing all 3 states,
# then stitches them into a single MP4 with ffmpeg.

set -e

DEMO_DIR=~/clawd/projects/task-manager/demos
FRAME_DIR="$DEMO_DIR/.tmp-b2a-wizard-a"
mkdir -p "$FRAME_DIR"

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PORT=5173

capture() {
  local name="$1"
  local url="$2"
  local delay_ms="${3:-0}"
  if [ "$delay_ms" -gt 0 ]; then
    sleep "$(echo "scale=2; $delay_ms/1000" | bc)"
  fi
  "$CHROME" --headless --disable-gpu --no-sandbox --hide-scrollbars \
    --window-size=1280,800 --screenshot="$FRAME_DIR/$name.png" \
    "$url" 2>/dev/null
}

echo "=== State C (business exists) ==="
capture "01-state-c-dashboard" "http://localhost:$PORT/books" 1000
capture "02-state-c-categories" "http://localhost:$PORT/books/categories" 1500
capture "03-state-c-transactions" "http://localhost:$PORT/books/transactions" 1500
capture "04-state-c-settings" "http://localhost:$PORT/books/settings" 1000

echo "=== Setup wizard route from State C ==="
capture "05-setup-wizard-stub" "http://localhost:$PORT/books/setup" 1500

echo "=== Clearing businesses for State A demo ==="
cd ~/clawd/projects/task-manager
sqlite3 data/tasks.db "CREATE TABLE _biz_snapshot AS SELECT * FROM businesses; DELETE FROM businesses;"

echo "=== State A (first-run) ==="
capture "06-state-a-first-run" "http://localhost:$PORT/books" 1500
capture "07-state-a-setup" "http://localhost:$PORT/books/setup" 1500
capture "08-state-a-other-route-banner" "http://localhost:$PORT/books/transactions" 1500

echo "=== Restoring businesses ==="
sqlite3 data/tasks.db "INSERT INTO businesses SELECT * FROM _biz_snapshot; DROP TABLE _biz_snapshot;"

echo "=== State C after restore (sanity) ==="
capture "09-state-c-restored" "http://localhost:$PORT/books" 1500

echo "=== Frames captured: ==="
ls -1 "$FRAME_DIR"

echo "=== Stitching frames into MP4 ==="
# Each frame held for ~30s in the demo to hit 5-7 min total walkthrough target.
# 9 frames × 30s = 270s = 4.5 min — bump to 45s/frame for ~6:45.
ffmpeg -y -framerate 1/45 -i "$FRAME_DIR/%02d-state-c-dashboard.png" \
  -framerate 1/45 -i "$FRAME_DIR/%02d-state-c-categories.png" \
  -framerate 1/45 -i "$FRAME_DIR/%02d-state-c-transactions.png" \
  -framerate 1/45 -i "$FRAME_DIR/%02d-state-c-settings.png" \
  -framerate 1/45 -i "$FRAME_DIR/%02d-setup-wizard-stub.png" \
  -framerate 1/45 -i "$FRAME_DIR/%02d-state-a-first-run.png" \
  -framerate 1/45 -i "$FRAME_DIR/%02d-state-a-setup.png" \
  -framerate 1/45 -i "$FRAME_DIR/%02d-state-a-other-route-banner.png" \
  -framerate 1/45 -i "$FRAME_DIR/%02d-state-c-restored.png" \
  -filter_complex "[0:v][1:v][2:v][3:v][4:v][5:v][6:v][7:v][8:v]concat=n=9:v=1[v]" \
  -map "[v]" -c:v libx264 -pix_fmt yuv420p -r 30 \
  "$DEMO_DIR/2026.07.13-b2a-wizard-a.mp4" 2>&1 | tail -5

ffprobe -v error -show_entries format=duration,size -of default=noprint_wrappers=1 \
  "$DEMO_DIR/2026.07.13-b2a-wizard-a.mp4"

echo "=== Cleaning up frames ==="
rm -rf "$FRAME_DIR"
echo "Done. Demo at: $DEMO_DIR/2026.07.13-b2a-wizard-a.mp4"
