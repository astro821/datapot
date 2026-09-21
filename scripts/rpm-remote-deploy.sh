#!/usr/bin/env bash
# Sync sources to DPOT_DEPLOY_HOST, bootstrap build tools if needed,
# build a self-contained RPM, and install it.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${DPOT_DEPLOY_HOST:-}"
REMOTE_DIR="${DPOT_DEPLOY_DIR:-/opt/src/datapot}"

if [[ -z "$HOST" ]]; then
  echo "Set DPOT_DEPLOY_HOST (e.g. user@build-host). Do not commit private hosts." >&2
  exit 1
fi

echo "[deploy] target=$HOST dir=$REMOTE_DIR"

ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new "$HOST" "mkdir -p '$REMOTE_DIR'"

echo "[deploy] ensuring build toolchain (rpmbuild, rsync, compilers)…"
ssh -o BatchMode=yes "$HOST" bash -s <<'EOS'
set -euo pipefail
need_pkgs=()
command -v rpmbuild >/dev/null 2>&1 || need_pkgs+=(rpm-build rpmdevtools)
command -v rsync >/dev/null 2>&1 || need_pkgs+=(rsync)
command -v gcc >/dev/null 2>&1 || need_pkgs+=(gcc-c++ make python3)
command -v tar >/dev/null 2>&1 || need_pkgs+=(tar)
command -v xz >/dev/null 2>&1 || need_pkgs+=(xz)
command -v curl >/dev/null 2>&1 || need_pkgs+=(curl ca-certificates)
if [[ ${#need_pkgs[@]} -gt 0 ]]; then
  dnf install -y "${need_pkgs[@]}" \
    || yum install -y "${need_pkgs[@]}"
fi
EOS

echo "[deploy] sync sources…"
if command -v rsync >/dev/null 2>&1; then
  rsync -az --delete \
    --exclude node_modules \
    --exclude .pnpm-store \
    --exclude data \
    --exclude .git \
    --exclude '**/dist' \
    --exclude rpm/stage \
    --exclude rpm/rpmbuild \
    --exclude rpm/deploy-api \
    --exclude .tools \
    "$ROOT/" "$HOST:$REMOTE_DIR/"
else
  TMP_TGZ="$(mktemp -t datapot-src.XXXXXX.tar.gz)"
  tar -C "$ROOT" -czf "$TMP_TGZ" \
    --exclude node_modules \
    --exclude .pnpm-store \
    --exclude data \
    --exclude .git \
    --exclude '*/dist' \
    --exclude rpm/stage \
    --exclude rpm/rpmbuild \
    --exclude rpm/deploy-api \
    --exclude .tools \
    .
  scp -o BatchMode=yes "$TMP_TGZ" "$HOST:/tmp/datapot-src.tar.gz"
  rm -f "$TMP_TGZ"
  ssh -o BatchMode=yes "$HOST" "rm -rf '$REMOTE_DIR' && mkdir -p '$REMOTE_DIR' && tar -C '$REMOTE_DIR' -xzf /tmp/datapot-src.tar.gz && rm -f /tmp/datapot-src.tar.gz"
fi
echo "[deploy] remote build + install…"
ssh -o BatchMode=yes "$HOST" bash -s <<EOF
set -euo pipefail
cd '$REMOTE_DIR'
chmod +x scripts/rpm-build.sh scripts/rpm-remote-deploy.sh
set +e
BUILD_LOG=\$(mktemp)
./scripts/rpm-build.sh 2>&1 | tee "\$BUILD_LOG"
RC=\${PIPESTATUS[0]}
set -e
if [[ \$RC -ne 0 ]]; then
  echo "[deploy] build failed" >&2
  tail -80 "\$BUILD_LOG" >&2
  exit \$RC
fi
RPM=\$(tail -1 "\$BUILD_LOG")
if [[ ! -f "\$RPM" ]]; then
  RPM=\$(cat rpm/.last-rpm 2>/dev/null || true)
fi
if [[ ! -f "\$RPM" ]]; then
  echo "[deploy] cannot locate RPM artifact" >&2
  exit 1
fi
echo "[deploy] installing \$RPM"
rpm -Uvh --force "\$RPM"
systemctl daemon-reload || true
systemctl enable datapot || true
systemctl restart datapot || systemctl start datapot || true
sleep 1
systemctl --no-pager -l status datapot || true
rpm -qi datapot | head -20
EOF

echo "[deploy] done"
