#!/usr/bin/env bash
# ╔═══════════════════════════════════════════════════╗
# ║          FinDash — One-Click Launcher             ║
# ║  Double-click this file to start the dashboard   ║
# ╚═══════════════════════════════════════════════════╝
#
# Requirements: Docker Desktop, Node.js 20+, Yarn

set -e
FINDASH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$FINDASH_DIR"

# ── colors ────────────────────────────────────────────
GREEN="\033[0;32m"; YELLOW="\033[1;33m"
CYAN="\033[0;36m"; RED="\033[0;31m"; RESET="\033[0m"
step()  { echo -e "\n${CYAN}▶ $1${RESET}"; }
ok()    { echo -e "${GREEN}✔ $1${RESET}"; }
warn()  { echo -e "${YELLOW}⚠ $1${RESET}"; }
fail()  { echo -e "${RED}✘ $1${RESET}"; }

echo -e "${GREEN}"
echo "  ███████╗██╗███╗   ██╗██████╗  █████╗ ███████╗██╗  ██╗"
echo "  ██╔════╝██║████╗  ██║██╔══██╗██╔══██╗██╔════╝██║  ██║"
echo "  █████╗  ██║██╔██╗ ██║██║  ██║███████║███████╗███████║"
echo "  ██╔══╝  ██║██║╚██╗██║██║  ██║██╔══██║╚════██║██╔══██║"
echo "  ██║     ██║██║ ╚████║██████╔╝██║  ██║███████║██║  ██║"
echo "  ╚═╝     ╚═╝╚═╝  ╚═══╝╚═════╝ ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝"
echo -e "${RESET}"
echo "  Real-time Portfolio Tracker"
echo "  ─────────────────────────────────────────────────────"

# ── 1. check docker ───────────────────────────────────
step "Checking Docker Desktop…"
if ! docker info &>/dev/null; then
  warn "Docker is not running. Starting Docker Desktop…"
  open -a "Docker"
  echo "  Waiting for Docker to start (up to 60s)…"
  for i in $(seq 1 30); do
    sleep 2
    if docker info &>/dev/null; then break; fi
    echo "  … ${i}/30"
  done
fi
if ! docker info &>/dev/null; then
  fail "Docker failed to start. Please open Docker Desktop manually and try again."
  read -p "Press Enter to close…"; exit 1
fi
ok "Docker is running"

# ── 2. start services ─────────────────────────────────
step "Starting Postgres · Redis · Kafka…"
docker compose up -d
ok "Services started"

# ── 3. wait for postgres ──────────────────────────────
step "Waiting for Postgres…"
for i in $(seq 1 20); do
  if docker compose exec -T postgres pg_isready -U postgres -q 2>/dev/null; then
    ok "Postgres ready"; break
  fi
  sleep 2
done

# ── 4. .env check ─────────────────────────────────────
if [ ! -f "apps/api/.env" ] && [ -f ".env" ]; then
  step "Copying .env to API workspace…"
  cp .env apps/api/.env
  ok ".env copied"
fi

# ── 5. build shared types ─────────────────────────────
step "Building shared types…"
yarn workspace @findash/shared build
ok "Shared types ready"

# ── 6. prisma ─────────────────────────────────────────
step "Running database migrations…"
(cd apps/api && npx prisma migrate deploy 2>/dev/null) || \
(cd apps/api && npx prisma migrate dev --name init 2>/dev/null) || true
yarn workspace @findash/api prisma:generate
ok "Database ready"

# ── 7. seed (first run only) ──────────────────────────
SEED_FLAG="$FINDASH_DIR/.findash_seeded"
if [ ! -f "$SEED_FLAG" ]; then
  step "Loading sample portfolio data (first run)…"
  (cd apps/api && npx tsx prisma/seed.ts) && touch "$SEED_FLAG"
  ok "Sample data loaded"
fi

# ── 8. clean stale build cache ────────────────────────
step "Cleaning build cache…"
rm -rf apps/api/dist apps/api/tsconfig.build.tsbuildinfo
ok "Cache cleared"

# ── 9. open browser after delay ───────────────────────
(sleep 12 && open "http://localhost:3000") &

# ── 10. start api + web ───────────────────────────────
echo ""
echo -e "  ${GREEN}→ Dashboard:${RESET} http://localhost:3000  (opens automatically)"
echo -e "  ${CYAN}→ API:${RESET}       http://localhost:3001"
echo ""
echo "  Press Ctrl+C to stop all services."
echo "  ─────────────────────────────────────────────────────"
echo ""

yarn dev
