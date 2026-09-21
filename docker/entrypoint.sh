#!/bin/sh
set -e

# Support: docker run ... single
# or DPOT_MODE=single
MODE_ARG=""
for arg in "$@"; do
  if [ "$arg" = "single" ] || [ "$arg" = "--single" ]; then
    export DPOT_MODE=single
    MODE_ARG=1
  fi
done

if [ -n "$MODE_ARG" ]; then
  # Drop mode tokens from argv if present as only args
  set -- node apps/api/dist/main.js single
fi

# If first arg is a known binary, run it
case "$1" in
  dpot)
    shift
    exec dpot "$@"
    ;;
  node|npm|pnpm)
    exec "$@"
    ;;
  *)
    if [ "$#" -eq 0 ] || [ "$1" = "single" ]; then
      exec node apps/api/dist/main.js ${DPOT_MODE:+single}
    fi
    exec "$@"
    ;;
esac
