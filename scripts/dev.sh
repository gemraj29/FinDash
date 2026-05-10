#!/usr/bin/env bash
# FinDash — single-command dev startup
# Usage (from monorepo root):  yarn dev:start
# Chains: install → Docker → DB setup → parallel API + Web

set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# ─── colors ────────────────────────────────────────────────────────────────
GREEN="\033[0;32m"; YELLOW="\033[1;33m"; CYAN="\033[0;36m"; RESET="\033[0m"
step() { echo -e "\n${CYAN}▶ $1${RESET}"; }
ok()   { echo -e "${GREEN}✔ $1${RESET}"; }
warn() { echo -e "${YELLOW}⚠ $1${RESET}"; }

# ─── 1. install dependencies (fast if already up to date) ─────────────────
step "Installing dependencies…"
yarn install --frozen-lockfile 2>/dev/null || yarn install
ok "Dependencies ready"

# ─── 2. docker services ────────────────────────────────────────────────────
step "Starting Docker services (Postgres · Redis · Kafka)…"
docker compose up -d
ok "Docker services running"

# ─── 3. wait for postgres to be ready ──────────────────────────────────────
step "Waiting for Postgres to be ready…"
for i in $(seq 1 20); do
  if docker compose exec -T postgres pg_isready -U postgres -q 2>/dev/null; then
    ok "Postgres ready"
    break
  fi
  echo "  … attempt $i/20"
  sleep 2
done

# ─── 4. build shared package (required before API compilation) ────────────
step "Building @findash/shared…"
yarn workspace @findash/shared build
ok "Shared package built → packages/shared/dist/"

# ─── 5. copy .env into api workspace if missing ────────────────────────────
if [ ! -f "apps/api/.env" ] && [ -f ".env" ]; then
  step "Copying root .env → apps/api/.env"
  cp .env apps/api/.env
  ok ".env copied"
fi

# ─── 6. prisma generate ────────────────────────────────────────────────────
step "Generating Prisma client…"
yarn db:generate
ok "Prisma client generated"

# ─── 7. prisma migrate ─────────────────────────────────────────────────────
step "Running database migrations…"
# Use 'migrate deploy' so it never prompts for a migration name
(cd apps/api && npx prisma migrate deploy) || {
  warn "migrate deploy failed — trying migrate dev"
  (cd apps/api && npx prisma migrate dev --name "auto")
}
ok "Database migrations applied"

# ─── 8. start api + web in parallel ───────────────────────────────────────
step "Starting API (port 3001) and Web (port 3000)…"
echo ""
echo -e "  ${GREEN}→ Dashboard:${RESET} http://localhost:3000"
echo -e "  ${CYAN}→ API:       ${RESET} http://localhost:3001"
echo ""
exec yarn dev
