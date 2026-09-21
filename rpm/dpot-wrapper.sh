#!/bin/sh
# Prefer bundled Node shipped inside the RPM
NODE="/opt/datapot/runtime/bin/node"
if [ ! -x "$NODE" ]; then
  NODE="/usr/bin/node"
fi
exec "$NODE" /opt/datapot/packages/cli/dist/index.js "$@"
