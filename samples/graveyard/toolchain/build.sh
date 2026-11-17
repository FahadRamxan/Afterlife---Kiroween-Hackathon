#!/usr/bin/env bash
# Compiles every sample in samples/graveyard into <OUT>/<app>/<EXE> (16-bit DOS), and turns its
# seed/*.csv files into .DBF files next to it. Runs inside the toolchain image.
# OUT defaults to dist (inside /graveyard). test.sh sets OUT=/tmp/... to compare.
set -euo pipefail
cd /graveyard
OUT="${OUT:-dist}"
# Absolute output folder: OUT may be relative to /graveyard (dist) or absolute (/tmp/dist).
case "$OUT" in /*) ;; *) OUT="/graveyard/$OUT" ;; esac
tools=$(mktemp -d)
toolchain/tools/build-tools.sh "$tools"

for envfile in */build.env; do
  app=$(dirname "$envfile")
  EXE=""; SEED_DATE=980701
  # shellcheck disable=SC1090
  source "$envfile"
  mkdir -p "$OUT/$app"
  rm -f "$OUT/$app"/*
  toolchain/compile.sh "$app" "$OUT/$app/$EXE" app
  for csv in "$app"/seed/*.csv; do
    [ -e "$csv" ] || continue
    "$tools/csv2dbf" "$csv" "$OUT/$app/$(basename "$csv" .csv).DBF" "$SEED_DATE"
  done
  echo "built $OUT/$app/$EXE"
done
rm -rf "$tools"
