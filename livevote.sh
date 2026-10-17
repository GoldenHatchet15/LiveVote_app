#!/usr/bin/env bash
#
# livevote.sh — on/off switch for the LiveVote production stack (app + tunnel).
#
#   ./livevote.sh on        start it (and bring it back on every reboot)
#   ./livevote.sh off       stop it (stays off, even across reboots)
#   ./livevote.sh status    show what's running
#   ./livevote.sh logs      follow logs (Ctrl-C to exit);  logs app | logs cloudflared
#   ./livevote.sh restart   restart it
#   ./livevote.sh update    rebuild from the latest code + restart (no data loss)
#
# The app runs on THIS computer, so it's reachable only while the computer is on
# AND the switch is "on". (For 24/7 without this machine you'd host it on a small
# always-on box / VPS — same compose file.)
set -euo pipefail
cd "$(dirname "$0")"

# Resolve Docker Compose (v2 plugin or v1 standalone).
if docker compose version >/dev/null 2>&1; then
  C=(docker compose -f docker-compose.prod.yml)
elif command -v docker-compose >/dev/null 2>&1; then
  C=(docker-compose -f docker-compose.prod.yml)
else
  echo "Docker Compose not found." >&2; exit 1
fi

# Use sudo only if the daemon isn't reachable as this user.
SUDO=""
docker ps >/dev/null 2>&1 || SUDO="sudo"

run() { ${SUDO:+$SUDO} "${C[@]}" "$@"; }

url() { sed -n 's/^PUBLIC_BASE_URL=//p' .env 2>/dev/null | head -1; }

case "${1:-}" in
  on|start|up)
    run up -d
    echo "✓ LiveVote is ON → $(url)"
    ;;
  off|stop|down)
    run stop
    echo "✓ LiveVote is OFF (stays off until you turn it on again)"
    ;;
  restart)
    run restart
    echo "✓ restarted → $(url)"
    ;;
  update|rebuild)
    run up -d --build
    echo "✓ rebuilt + restarted → $(url)"
    ;;
  status|ps)
    run ps
    ;;
  logs)
    shift || true
    run logs -f --tail=50 "$@"
    ;;
  *)
    echo "Usage: ./livevote.sh {on|off|restart|update|status|logs [app|cloudflared]}"
    exit 1
    ;;
esac
