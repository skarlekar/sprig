#!/usr/bin/env bash
# Stops Sprig. Your maps stay in the Docker volume and are there next time you run ./start.sh.
set -euo pipefail
cd "$(dirname "$0")"

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running, so Sprig is already stopped."
  exit 0
fi

docker compose down
printf '\033[1;32m==>\033[0m Sprig stopped. Your maps are kept; run ./start.sh to start again.\n'
