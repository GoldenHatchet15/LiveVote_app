#!/usr/bin/env bash
#
# run.sh — start LiveVote.
#
#   ./run.sh            Development mode (default):
#                         server on :3000, client dev server on :5173.
#                         Open http://localhost:5173/admin
#
#   ./run.sh prod       Production mode: build everything, then serve the
#                         client + API + sockets on one port (:3000).
#                         Open http://localhost:3000/admin
#
# On first run it auto-installs dependencies, creates server/.env from the
# example, and migrates + seeds the database. Safe to re-run any time.
#
set -euo pipefail

cd "$(dirname "$0")"

MODE="${1:-dev}"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }

# --- Node version check ----------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install Node.js 20+ and try again." >&2
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node.js 20+ is required (found $(node -v))." >&2
  exit 1
fi

# --- First-run setup -------------------------------------------------------
if [ ! -d node_modules ]; then
  bold "Installing dependencies (first run)…"
  npm install
fi

if [ ! -f server/.env ]; then
  bold "Creating server/.env from .env.example…"
  cp .env.example server/.env
  echo "  -> Edit server/.env to set ADMIN_PASSWORD and SESSION_SECRET (defaults are fine for local play)."
fi

if [ ! -f server/prisma/dev.db ]; then
  bold "Setting up the database (migrate + seed)…"
  npm run db:migrate
  npm run db:seed
fi

# --- Run -------------------------------------------------------------------
case "$MODE" in
  dev)
    bold "Starting LiveVote in DEVELOPMENT mode"
    echo "  Admin:  http://localhost:5173/admin"
    echo "  Play:   http://localhost:5173/play"
    echo "  (Ctrl-C to stop)"
    echo
    exec npm run dev
    ;;
  prod)
    bold "Building LiveVote for production…"
    npm run build
    bold "Starting LiveVote in PRODUCTION mode"
    echo "  Everything served on http://localhost:3000"
    echo "  Admin:  http://localhost:3000/admin"
    echo "  Play:   http://localhost:3000/play"
    echo "  (Ctrl-C to stop)"
    echo
    exec npm start
    ;;
  *)
    echo "Usage: ./run.sh [dev|prod]" >&2
    exit 1
    ;;
esac
