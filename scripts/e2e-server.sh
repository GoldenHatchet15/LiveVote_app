#!/bin/sh
# Boot the built app against an isolated e2e SQLite database.
set -e
cd "$(dirname "$0")/.."
npm run db:migrate -w server
npm run db:seed -w server
exec node server/dist/index.js
