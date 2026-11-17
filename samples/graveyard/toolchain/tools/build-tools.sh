#!/usr/bin/env bash
# Builds the host tools (csv2dbf, dbf2csv) into <dir>. Usage: build-tools.sh <dir>
set -euo pipefail
out="$1"
lib=/graveyard/toolchain/lib
for tool in csv2dbf dbf2csv; do
  gcc -std=c89 -pedantic -Wall -Wextra -Werror -I"$lib" -o "$out/$tool" \
    "/graveyard/toolchain/tools/$tool.c" "$lib/dbf3.c"
done
