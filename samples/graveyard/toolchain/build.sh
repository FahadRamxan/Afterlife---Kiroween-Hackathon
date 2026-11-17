#!/usr/bin/env bash
# Compiles every sample in samples/graveyard into dist/<app>/<EXE> as a 16-bit DOS program,
# and copies its seed .DBF files next to it. Runs inside the toolchain image.
# Each app folder has build.env with EXE=<NAME>.EXE and SOURCES="src/a.c src/b.c".
set -euo pipefail
cd /graveyard
OUT="${OUT:-dist}"
# Absolute output folder: OUT may be relative to /graveyard (dist) or absolute (/tmp/dist).
case "$OUT" in /*) ;; *) OUT="/graveyard/$OUT" ;; esac
LIB=toolchain/lib

for envfile in */build.env; do
  app=$(dirname "$envfile")
  # shellcheck disable=SC1090
  EXE=""; SOURCES=""; source "$envfile"
  mkdir -p "$OUT/$app"
  rm -f "$OUT/$app"/*
  objdir=$(mktemp -d)
  srcs="/graveyard/$LIB/dbf3.c"
  for s in $SOURCES; do srcs="$srcs /graveyard/$app/$s"; done
  # -bt=dos -ms: DOS target, small memory model. -0: 8086 instructions. -os: optimise for size.
  # -w4 -we: all warnings, as errors. -zq: quiet.
  # -k8192: 8 KB stack. The 2 KB default overflows with a DBF struct and two record buffers.
  (cd "$objdir" && wcl -bt=dos -ms -0 -os -w4 -we -zq -k8192 -i="/graveyard/$LIB" -fe="$OUT/$app/$EXE" $srcs)
  rm -rf "$objdir"
  if compgen -G "$app/seed/*.DBF" > /dev/null; then cp "$app"/seed/*.DBF "$OUT/$app/"; fi
  echo "built $OUT/$app/$EXE"
done
