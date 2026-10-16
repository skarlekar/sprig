#!/usr/bin/env bash
# Starts Sprig in Docker, waits until it answers, then opens it in your browser.
set -euo pipefail
cd "$(dirname "$0")"

say() { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31mError:\033[0m %s\n' "$*" >&2; exit 1; }

command -v docker >/dev/null || die "Docker is not installed. Get Docker Desktop from https://www.docker.com/products/docker-desktop/"

# Start Docker Desktop on macOS if it isn't running yet.
if ! docker info >/dev/null 2>&1; then
  if [[ "$(uname)" == "Darwin" ]] && [[ -d /Applications/Docker.app ]]; then
    say "Starting Docker Desktop…"
    open -a Docker
    for _ in $(seq 1 60); do docker info >/dev/null 2>&1 && break; sleep 2; done
  fi
  docker info >/dev/null 2>&1 || die "Docker is not running. Start Docker Desktop and try again."
fi

# First run: create .env with fresh secrets and local test sign-in.
if [[ ! -f .env ]]; then
  email="${SPRIG_EMAIL:-$(git config user.email 2>/dev/null || true)}"
  [[ -n "$email" ]] || read -rp "Email address allowed to sign in: " email
  [[ -n "$email" ]] || die "An email address is needed."
  say "Creating .env for $email"
  cat > .env <<ENV
PUBLIC_URL=http://localhost:8080
ALLOWED_EMAILS=$email
OWNER_EMAIL=$email
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
FACEBOOK_CLIENT_ID=
FACEBOOK_CLIENT_SECRET=
X_CLIENT_ID=
X_CLIENT_SECRET=
DEV_LOGIN=1
SESSION_SECRET=$(openssl rand -hex 32)
SHARE_KEY=$(openssl rand -hex 32)
ENV
  chmod 600 .env
fi

url="$(grep -E '^PUBLIC_URL=' .env | cut -d= -f2- || true)"
url="${url:-http://localhost:8080}"

say "Building and starting Sprig…"
docker compose up -d --build

say "Waiting for Sprig to answer…"
for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:8080/healthz" >/dev/null 2>&1; then
    say "Sprig is running at $url"
    case "$(uname)" in
      Darwin) open "$url" ;;
      Linux) command -v xdg-open >/dev/null && xdg-open "$url" >/dev/null 2>&1 || true ;;
      MINGW*|MSYS*|CYGWIN*) start "$url" ;;
    esac
    echo "Stop it with ./stop.sh   ·   Logs: docker compose logs -f"
    exit 0
  fi
  sleep 1
done

docker compose logs --tail 30
die "Sprig did not start within 60 seconds. The log above shows why."
