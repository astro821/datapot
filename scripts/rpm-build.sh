#!/usr/bin/env bash
# Build a self-contained DataPot RPM (bundles Node.js + production node_modules).
# Intended to run on Linux x86_64 (deploy host).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NAME="datapot"
NODE_VERSION="${DPOT_NODE_VERSION:-20.18.1}"
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64) NODE_ARCH="x64" ;;
  aarch64|arm64) NODE_ARCH="arm64" ;;
  *) echo "unsupported arch: $ARCH" >&2; exit 1 ;;
esac

need() { command -v "$1" >/dev/null 2>&1 || { echo "missing: $1" >&2; exit 1; }; }
need rpmbuild
need curl
need tar

# --- ensure Node + pnpm available for build ---
BOOTSTRAP_NODE="${DPOT_BOOTSTRAP_NODE:-/opt/datapot-build/node}"
if ! command -v node >/dev/null 2>&1 || ! command -v pnpm >/dev/null 2>&1; then
  echo "[rpm] bootstrapping Node ${NODE_VERSION} (${NODE_ARCH}) for build…"
  mkdir -p "$(dirname "$BOOTSTRAP_NODE")"
  TARBALL="node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz"
  URL="https://nodejs.org/dist/v${NODE_VERSION}/${TARBALL}"
  TMP="/tmp/${TARBALL}"
  if [[ ! -x "${BOOTSTRAP_NODE}/bin/node" ]]; then
    curl -fsSL "$URL" -o "$TMP"
    rm -rf "$BOOTSTRAP_NODE"
    mkdir -p "$BOOTSTRAP_NODE"
    tar -xJf "$TMP" -C "$BOOTSTRAP_NODE" --strip-components=1
  fi
  export PATH="${BOOTSTRAP_NODE}/bin:$PATH"
  if ! command -v pnpm >/dev/null 2>&1; then
    corepack enable >/dev/null 2>&1 || true
    corepack prepare pnpm@9.15.0 --activate >/dev/null 2>&1 \
      || npm install -g pnpm@9.15.0
  fi
fi

need node
need pnpm
echo "[rpm] node=$(node -v) pnpm=$(pnpm -v)"

SPEC="$ROOT/rpm/datapot.spec"
SPEC_VER="$(sed -n 's/^Version:[[:space:]]*//p' "$SPEC" | head -1 | tr -d '[:space:]')"
SPEC_REL_NUM="$(grep -E '^Release:' "$SPEC" | head -1 | sed -E 's/^Release:[[:space:]]*([0-9]+).*/\1/')"

INSTALLED_VER=""
if rpm -q "$NAME" >/dev/null 2>&1; then
  INSTALLED_VER="$(rpm -q --qf '%{VERSION}' "$NAME")"
fi

if [[ -n "$INSTALLED_VER" && "$INSTALLED_VER" == "$SPEC_VER" ]]; then
  NEW_REL=$((SPEC_REL_NUM + 1))
  echo "[rpm] installed $INSTALLED_VER — bumping Release ${SPEC_REL_NUM} → ${NEW_REL}"
  sed -i -E "s/^Release:[[:space:]]*[0-9]+/Release:     ${NEW_REL}/" "$SPEC"
  SPEC_REL_NUM="$NEW_REL"
else
  echo "[rpm] Version=${SPEC_VER} Release=${SPEC_REL_NUM} (installed=${INSTALLED_VER:-none})"
fi

# Persist Release bump into working tree spec for next sync awareness
# (already edited above)

echo "[rpm] pnpm install + build…"
pnpm install --frozen-lockfile 2>/dev/null || pnpm install
pnpm --filter @datapot/shared build
pnpm --filter @datapot/cli build
pnpm --filter @datapot/api build
pnpm --filter @datapot/web build

STAGE_ROOT="$ROOT/rpm/stage"
STAGE="$STAGE_ROOT/opt/datapot"
rm -rf "$STAGE_ROOT"
mkdir -p "$STAGE/apps/api" "$STAGE/apps/web" "$STAGE/packages/cli" "$STAGE/packages/shared" "$STAGE/runtime"

# --- bundle Node runtime (self-contained) ---
echo "[rpm] bundling Node ${NODE_VERSION} into package…"
TARBALL="node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz"
URL="https://nodejs.org/dist/v${NODE_VERSION}/${TARBALL}"
TMP="/tmp/${TARBALL}"
[[ -f "$TMP" ]] || curl -fsSL "$URL" -o "$TMP"
tar -xJf "$TMP" -C "$STAGE/runtime" --strip-components=1

# --- app artifacts ---
cp -a "$ROOT/apps/api/dist" "$STAGE/apps/api/"
cp -a "$ROOT/apps/api/package.json" "$STAGE/apps/api/"
cp -a "$ROOT/apps/web/dist" "$STAGE/apps/web/"
cp -a "$ROOT/packages/cli/dist" "$STAGE/packages/cli/"
cp -a "$ROOT/packages/cli/package.json" "$STAGE/packages/cli/"
cp -a "$ROOT/packages/shared/dist" "$STAGE/packages/shared/"
cp -a "$ROOT/packages/shared/package.json" "$STAGE/packages/shared/"
cp -a "$ROOT/package.json" "$STAGE/"
cp -a "$ROOT/pnpm-workspace.yaml" "$STAGE/"
cp -a "$ROOT/pnpm-lock.yaml" "$STAGE/" 2>/dev/null || true

# Production node_modules via pnpm deploy (isolated, no workspace links)
echo "[rpm] packing production dependencies…"
DEPLOY_DIR="$ROOT/rpm/deploy-api"
rm -rf "$DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR"
# Deploy api package with prod deps (includes workspace deps built)
pnpm --filter @datapot/api deploy --prod --legacy "$DEPLOY_DIR" \
  || pnpm --filter @datapot/api deploy --prod "$DEPLOY_DIR"

# Merge deploy output into stage
if [[ -d "$DEPLOY_DIR/node_modules" ]]; then
  cp -a "$DEPLOY_DIR/node_modules" "$STAGE/"
fi
# Ensure api dist from monorepo build wins
cp -a "$ROOT/apps/api/dist" "$STAGE/apps/api/"
# shared may be nested under node_modules/@datapot/shared — also keep packages/shared for CLI path
if [[ -d "$DEPLOY_DIR/node_modules/@datapot/shared" ]]; then
  mkdir -p "$STAGE/node_modules/@datapot"
  cp -a "$DEPLOY_DIR/node_modules/@datapot/shared" "$STAGE/node_modules/@datapot/" 2>/dev/null || true
fi

# CLI needs to resolve @datapot/shared — install prod deps for cli into packages/cli
(
  cd "$STAGE/packages/cli"
  "$STAGE/runtime/bin/node" "$STAGE/runtime/lib/node_modules/npm/bin/npm-cli.js" \
    install --omit=dev --no-package-lock 2>/dev/null \
    || "$STAGE/runtime/bin/npm" install --omit=dev --no-package-lock 2>/dev/null \
    || true
)

# Point package main paths: api runs from /opt/datapot with NODE_PATH
cat > "$STAGE/apps/api/run.env" <<'EOR'
NODE_PATH=/opt/datapot/node_modules
EOR

# Wrapper + service into SOURCES later; embed copies for clarity
cp "$ROOT/rpm/dpot-wrapper.sh" "$STAGE/dpot"
chmod 755 "$STAGE/dpot"

# --- rpmbuild ---
TOPDIR="$ROOT/rpm/rpmbuild"
rm -rf "$TOPDIR"
mkdir -p "$TOPDIR"/{BUILD,RPMS,SOURCES,SPECS,SRPMS}

tar -C "$STAGE_ROOT" -czf "$TOPDIR/SOURCES/datapot-opt.tar.gz" opt
cp "$ROOT/rpm/dpot-wrapper.sh" "$TOPDIR/SOURCES/"
cp "$ROOT/rpm/datapot.service" "$TOPDIR/SOURCES/"

DIST_TAG="$(rpm --eval '%{?dist}' 2>/dev/null || echo '.el9')"

cat > "$TOPDIR/SPECS/datapot.spec" <<EOF
Name:        datapot
Version:     ${SPEC_VER}
Release:     ${SPEC_REL_NUM}${DIST_TAG}
Summary:     DataPot — self-contained (bundled Node.js + deps)
License:     MIT
URL:         https://github.com/example/datapot
BuildArch:   ${ARCH}
AutoReq:     no
AutoProv:    no
Source0:     dpot-wrapper.sh
Source1:     datapot.service
Source2:     datapot-opt.tar.gz

%description
DataPot management console and dynamic pot APIs.
This package bundles Node.js ${NODE_VERSION} and production dependencies;
no system Node.js is required.

%install
mkdir -p %{buildroot}
tar -C %{buildroot} -xzf %{SOURCE2}
mkdir -p %{buildroot}/usr/local/bin
mkdir -p %{buildroot}/usr/lib/systemd/system
mkdir -p %{buildroot}/var/lib/datapot
install -m 0755 %{SOURCE0} %{buildroot}/usr/local/bin/dpot
install -m 0644 %{SOURCE1} %{buildroot}/usr/lib/systemd/system/datapot.service

%files
/opt/datapot
/usr/local/bin/dpot
/usr/lib/systemd/system/datapot.service
%dir /var/lib/datapot

%pre
getent group datapot >/dev/null || groupadd -r datapot || true
getent passwd datapot >/dev/null || useradd -r -g datapot -s /sbin/nologin -d /var/lib/datapot datapot || true

%post
chown -R datapot:datapot /var/lib/datapot || true
systemctl daemon-reload || true

%postun
systemctl daemon-reload || true

%changelog
* $(date '+%a %b %d %Y') DataPot Maintainers - ${SPEC_VER}-${SPEC_REL_NUM}
- Self-contained package with bundled Node.js and dependencies
EOF

# Keep source tree spec Release in sync
sed -i -E "s/^Release:[[:space:]]*[0-9]+.*/Release:     ${SPEC_REL_NUM}%{?dist}/" "$SPEC"

echo "[rpm] rpmbuild…"
rpmbuild --define "_topdir $TOPDIR" -bb "$TOPDIR/SPECS/datapot.spec"

RPM_FILE="$(find "$TOPDIR/RPMS" -name 'datapot-*.rpm' | sort | tail -1)"
if [[ -z "$RPM_FILE" || ! -f "$RPM_FILE" ]]; then
  echo "RPM not found under $TOPDIR/RPMS" >&2
  exit 1
fi

echo "[rpm] built: $RPM_FILE ($(du -h "$RPM_FILE" | awk '{print $1}'))"
echo "$RPM_FILE" > "$ROOT/rpm/.last-rpm"
# print only the path on the last line for callers
echo "$RPM_FILE"
