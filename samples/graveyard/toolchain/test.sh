#!/usr/bin/env bash
# Full toolchain check, run inside the toolchain image by `pnpm graveyard:test`:
#   1. C unit tests (*test.c) with gcc on Linux
#   2. the same tests built for 16-bit DOS and run in DOSBox, where int is 16 bits
#   3. every seed CSV round-trips through csv2dbf and dbf2csv unchanged
#   4. a fresh build matches the committed dist/
#   5. HELLO.EXE, and every <app>/scenarios/*.keys, run in DOSBox
#   6. all outputs match the committed fixtures/ byte for byte (UPDATE_FIXTURES=1 rewrites them)
# A unit test file names the sources it needs in a comment: "SOURCES: path/a.c path/b.c".
set -euo pipefail
cd /graveyard
NEW=$(mktemp -d)
T=$(mktemp -d)
toolchain/tools/build-tools.sh "$T"
fail() { echo "FAIL: $*"; exit 1; }

# */test also matches toolchain/test, so remove duplicates.
unit_tests=$(ls toolchain/test/*test.c */test/*test.c 2>/dev/null | sort -u)
mkdir -p "$NEW/unit"

# Test names are <folder>-<file> (shifa-rulestest), because several apps have a rulestest.c.
test_name() { echo "$(echo "$1" | cut -d/ -f1)-$(basename "$1" .c)"; }

echo "== 1. C unit tests (gcc)"
for t in $unit_tests; do
  name=$(test_name "$t")
  srcs=$(sed -n 's/^ \* SOURCES: //p; s/^\/\* SOURCES: //p' "$t" | sed 's/ \*\/$//')
  [ -n "$srcs" ] || fail "$t has no SOURCES comment"
  w=$(mktemp -d)
  # shellcheck disable=SC2086
  gcc -std=c89 -pedantic -Wall -Wextra -Werror -Itoolchain/lib -o "$w/$name" "$t" $srcs
  (cd "$w" && ./"$name") > "$NEW/unit/$name-gcc.txt" || true
  echo "$name: $(tail -1 "$NEW/unit/$name-gcc.txt")"
  grep -q '^ALL .* CHECKS PASSED$' "$NEW/unit/$name-gcc.txt" || { cat "$NEW/unit/$name-gcc.txt"; fail "$name on gcc"; }
done

echo "== 2. C unit tests (16-bit DOS in DOSBox)"
n=0
for t in $unit_tests; do
  name=$(test_name "$t")
  n=$((n + 1))
  exe="UNIT$n.EXE" # DOS names are 8.3
  srcs=$(sed -n 's/^ \* SOURCES: //p; s/^\/\* SOURCES: //p' "$t" | sed 's/ \*\/$//')
  abs=""
  for s in $srcs; do abs="$abs /graveyard/$s"; done
  w=$(mktemp -d)
  # shellcheck disable=SC2086
  (cd "$w" && wcl -bt=dos -ms -0 -w4 -we -zq -k8192 -i=/graveyard/toolchain/lib -fe="$exe" "/graveyard/$t" $abs)
  toolchain/run-dos.sh "$w" "$exe"
  cp "$w/OUT.TXT" "$NEW/unit/$name-dos.txt"
  echo "$name: $(tail -1 "$NEW/unit/$name-dos.txt")"
  grep -q '^ALL .* CHECKS PASSED$' "$NEW/unit/$name-dos.txt" || { cat "$NEW/unit/$name-dos.txt"; fail "$name on DOS"; }
done

echo "== 3. seed CSV round trip"
for csv in */seed/*.csv; do
  [ -e "$csv" ] || continue
  "$T/csv2dbf" "$csv" "$T/rt.dbf" 19980101
  if ! diff <(grep -v '^#' "$csv") <("$T/dbf2csv" "$T/rt.dbf" | grep -v '^#') > /dev/null; then
    diff <(grep -v '^#' "$csv") <("$T/dbf2csv" "$T/rt.dbf" | grep -v '^#') || true
    fail "$csv does not round-trip"
  fi
done
echo "all seed CSVs round-trip"

echo "== 4. build and compare with the committed dist/"
OUT=/tmp/dist toolchain/build.sh
diff -r /tmp/dist dist > /dev/null || { diff -rq /tmp/dist dist || true; fail "dist/ is out of date: run pnpm graveyard:build and commit it"; }
echo "dist/ is up to date"

echo "== 5a. HELLO.EXE in DOSBox"
run=$(mktemp -d)
cp dist/hello/HELLO.EXE "$run/"
toolchain/run-dos.sh "$run" HELLO.EXE
cat "$run/OUT.TXT"
# A crash (for example a stack overflow) prints nothing here.
grep -q '^HELLO FROM 1998$' "$run/OUT.TXT" || fail "HELLO.EXE output"
grep -q '^READ 2 RECORDS: PAN500 45.50, ASP100 12.00$' "$run/OUT.TXT" || fail "HELLO.EXE output"
test "$(stat -c %s "$run/HELLO.DBF")" = 128 || fail "HELLO.DBF size"
mkdir -p "$NEW/hello"
cp "$run/OUT.TXT" "$run/HELLO.DBF" "$NEW/hello/"

echo "== 5b. scripted scenarios in DOSBox"
for dir in */scenarios; do
  app=$(dirname "$dir")
  EXE=""; DOS_TIME=""
  # shellcheck disable=SC1090
  source "$app/build.env"
  # The app's default DOS clock (build.env DOS_TIME), else 15 July 1998.
  app_time="${DOS_TIME:-1998-07-15 10:00:00}"
  base=${EXE%.EXE}
  tst="${base:0:5}TST.EXE"
  bin=$(mktemp -d)
  toolchain/compile.sh "$app" "$bin/$tst" test
  for keys in "$dir"/*.keys; do
    s=$(basename "$keys" .keys)
    run=$(mktemp -d)
    cp "dist/$app"/* "$run/"
    cp "$bin/$tst" "$run/"
    cp "$keys" "$run/KEYS.TXT"
    time_file="$dir/$s.time"
    dos_time="$app_time"
    [ -f "$time_file" ] && dos_time=$(cat "$time_file")
    DOS_TIME="$dos_time" toolchain/run-dos.sh "$run" "$tst"
    out="$NEW/$app/$s"
    mkdir -p "$out"
    [ -f "$run/EXIT.TXT" ] || fail "$app/$s: no EXIT.TXT (crash or hang)"
    tr -d '\r' < "$run/EXIT.TXT" > "$out/EXIT.TXT"
    for scr in "$run"/*.SCR; do [ -e "$scr" ] && tr -d '\r' < "$scr" > "$out/$(basename "$scr")"; done
    for dbf in "$run"/*.DBF; do "$T/dbf2csv" "$dbf" > "$out/$(basename "$dbf" .DBF).csv"; done
    result=$(cat "$out/EXIT.TXT")
    echo "$app/$s: $result"
    [ "$result" = OK ] || { [ -f "$out/END.SCR" ] && head -25 "$out/END.SCR"; fail "$app/$s: $result"; }
  done
done

echo "== 6. fixtures"
if [ "${UPDATE_FIXTURES:-0}" = 1 ]; then
  rm -rf fixtures
  cp -r "$NEW" fixtures
  echo "fixtures/ updated"
elif ! diff -r "$NEW" fixtures > /dev/null; then
  diff -r "$NEW" fixtures | head -40 || true
  fail "fixtures/ differ from this run. If the change is intended: pnpm graveyard:update, then commit"
else
  echo "fixtures/ match"
fi
echo "toolchain test PASSED"
