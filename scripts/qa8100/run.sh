#!/usr/bin/env bash
set -euo pipefail
# Dependencies: repository's pnpm install, plus Playwright and its Chromium.
# Invoke from the CC Switch checkout using bash /path/to/evidence/run.sh.
evidence_dir="$(cd "$(dirname "$0")" && pwd)"
bash "$evidence_dir/prepare.sh"
pnpm exec vite --host 127.0.0.1 --port 38100 > /tmp/ccswitch-8100-vite.log 2>&1 &
server_pid=$!
cleanup() {
  kill "$server_pid" 2>/dev/null || true
  rm -f src/qa8100.html src/qa8100.tsx src/qa8100-before.html src/qa8100-before.tsx src/components/providers/ProviderList8100Before.tsx
}
trap cleanup EXIT
ready=false
for attempt in $(seq 1 60); do
  if curl --fail --silent http://127.0.0.1:38100/qa8100.html > /dev/null; then
    ready=true
    break
  fi
  sleep 1
done
if [ "$ready" != true ]; then
  cat /tmp/ccswitch-8100-vite.log
  exit 1
fi
node "$evidence_dir/verify.cjs"
