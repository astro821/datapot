#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export PATH="$ROOT/.tools/node_modules/.bin:$PATH"
export DPOT_MODE="${DPOT_MODE:-single}"
export DPOT_DATA_DIR="${DPOT_DATA_DIR:-$ROOT/data}"
export DPOT_ADMIN_PASSWORD="${DPOT_ADMIN_PASSWORD:-datapot}"
export DPOT_WEB_PORT="${DPOT_WEB_PORT:-8080}"
export DPOT_JWT_SECRET="${DPOT_JWT_SECRET:-datapot-dev-secret}"

mkdir -p "$DPOT_DATA_DIR"

echo "[datapot] building @datapot/shared…"
pnpm --filter @datapot/shared build

cleanup() {
  echo
  echo "[datapot] shutting down…"
  kill 0 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "[datapot] starting API (single) on :$DPOT_WEB_PORT …"
pnpm --filter @datapot/api run dev &

echo "[datapot] starting Web on :5173 …"
pnpm --filter @datapot/web run dev &

wait
