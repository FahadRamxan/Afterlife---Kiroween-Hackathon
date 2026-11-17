#!/usr/bin/env bash
# Compiles one sample app into a 16-bit DOS EXE. Usage: compile.sh <app> <out.exe> <app|test>
#   app:  the shipped EXE, with the real keyboard (kbd_bios.c)
#   test: the scripted test build, reading KEYS.TXT (kbd_script.c + kbd_parse.c)
# <app>/build.env sets EXE, LIBS (from toolchain/lib) and SOURCES (in the app folder).
set -euo pipefail
app="$1"; out="$2"; mode="$3"
lib=/graveyard/toolchain/lib
EXE=""; SOURCES=""; LIBS="dbf3"
# shellcheck disable=SC1090
source "/graveyard/$app/build.env"
srcs=""
for l in $LIBS; do
  if [ "$l" = kbd ]; then
    if [ "$mode" = test ]; then srcs="$srcs $lib/kbd_script.c $lib/kbd_parse.c"; else srcs="$srcs $lib/kbd_bios.c"; fi
  else
    srcs="$srcs $lib/$l.c"
  fi
done
for s in $SOURCES; do srcs="$srcs /graveyard/$app/$s"; done
obj=$(mktemp -d)
# -bt=dos -ms: DOS, small memory model. -0: 8086 instructions. -os: optimise for size.
# -w4 -we: all warnings, as errors. -zq: quiet.
# -k8192: 8 KB stack. The 2 KB default overflows with a DBF struct and two record buffers.
# shellcheck disable=SC2086
(cd "$obj" && wcl -bt=dos -ms -0 -os -w4 -we -zq -k8192 -i="$lib" -fe="$out" $srcs)
rm -rf "$obj"
