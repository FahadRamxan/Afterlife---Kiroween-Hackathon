#!/usr/bin/env bash
# Runs a DOS command in headless DOSBox with <dir> mounted as C:, and saves its output in
# <dir>/OUT.TXT. DOSBox takes the DOS date from the host clock, so faketime starts that clock at
# DOS_TIME (default 1998-07-15 10:00:00). Runs are repeatable and really happen in 1998.
# A run that does not finish in DOSBOX_TIMEOUT seconds (default 120) is tried once more, from a
# fresh copy of <dir>: DOSBox hung about once in 300 runs, even at fixed cycles.
# Usage: run-dos.sh <dir> <command>
set -euo pipefail
dir="$1"; cmd="$2"; dos_time="${DOS_TIME:-1998-07-15 10:00:00}"; limit="${DOSBOX_TIMEOUT:-120}"
conf=$(mktemp --suffix=.conf)
fresh=$(mktemp -d)
trap 'rm -rf "$conf" "$fresh"' EXIT
cat > "$conf" <<EOF
[sdl]
output=surface
[cpu]
# Fixed speed. cycles=max hung DOSBox in about 1 run in 25 (measured: 4 of 100 with max,
# 0 of 200 with fixed 20000). A fixed speed also makes runs repeatable.
cycles=fixed 20000
[mixer]
nosound=true
[speaker]
pcspeaker=false
[autoexec]
mount c "$dir"
c:
$cmd > OUT.TXT
exit
EOF
# The folder as it was before the first attempt, for a retry.
cp -a "$dir/." "$fresh/"
run() { timeout "$limit" faketime -f "@$dos_time" dosbox -conf "$conf" -exit > /dev/null 2>&1; }
if ! run; then
  echo "run-dos.sh: DOSBox did not finish in $limit s running $cmd (attempt 1); retrying once from a fresh copy" >&2
  find "$dir" -mindepth 1 -delete
  cp -a "$fresh/." "$dir/"
  if ! run; then
    echo "run-dos.sh: DOSBox did not finish in $limit s running $cmd (attempt 2)" >&2
    exit 124
  fi
fi
tr -d '\r' < "$dir/OUT.TXT" > "$dir/OUT.LF" && mv "$dir/OUT.LF" "$dir/OUT.TXT"
