#!/bin/sh
set -e

echo "LiveVote: applying database migrations…"
npm run db:migrate -w server

echo "LiveVote: seeding sample question sets…"
npm run db:seed -w server || echo "Seed skipped/failed (continuing)."

echo "LiveVote: starting server on port ${PORT:-3000}…"
exec node server/dist/index.js
