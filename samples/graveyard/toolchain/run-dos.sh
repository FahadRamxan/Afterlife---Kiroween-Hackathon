#!/usr/bin/env bash
# Runs a DOS command in headless DOSBox with <dir> mounted as C:, and saves its output in
# <dir>/OUT.TXT. DOSBox takes the DOS date from the host clock, so faketime starts that clock at
# DOS_TIME (default 1998-07-15 10:00:00). Runs are repeatable and really happen in 1998.
# Usage: run-dos.sh <dir> <command>
set -euo pipefail
dir="$1"; cmd="$2"; dos_time="${DOS_TIME:-1998-07-15 10:00:00}"
conf=$(mktemp --suffix=.conf)
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
if ! timeout 120 faketime -f "@$dos_time" dosbox -conf "$conf" -exit > /dev/null 2>&1; then
  echo "run-dos.sh: DOSBox did not finish in 120 s running $cmd" >&2
  exit 124
fi
rm -f "$conf"
tr -d '\r' < "$dir/OUT.TXT" > "$dir/OUT.LF" && mv "$dir/OUT.LF" "$dir/OUT.TXT"
