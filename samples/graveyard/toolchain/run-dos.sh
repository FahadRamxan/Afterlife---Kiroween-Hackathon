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
cycles=max
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
timeout 120 faketime -f "@$dos_time" dosbox -conf "$conf" -exit > /dev/null 2>&1
rm -f "$conf"
tr -d '\r' < "$dir/OUT.TXT" > "$dir/OUT.LF" && mv "$dir/OUT.LF" "$dir/OUT.TXT"
