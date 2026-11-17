#!/usr/bin/env bash
# Full toolchain check, run inside the toolchain image by `pnpm graveyard:test`:
#   1. dbf3 unit tests with gcc on Linux
#   2. the same tests built for 16-bit DOS and run in DOSBox
#   3. build every sample and check the committed dist/ is up to date
#   4. run HELLO.EXE in DOSBox and save its output as fixtures/hello
set -euo pipefail
cd /graveyard
mkdir -p fixtures/dbf3test fixtures/hello

echo "== 1. dbf3 tests (gcc)"
work=$(mktemp -d)
gcc -std=c89 -pedantic -Wall -Wextra -Werror -Itoolchain/lib -o "$work/dbf3test" \
  toolchain/test/dbf3test.c toolchain/lib/dbf3.c
(cd "$work" && ./dbf3test) | tee fixtures/dbf3test/gcc.txt
grep -q '^ALL .* CHECKS PASSED$' fixtures/dbf3test/gcc.txt

echo "== 2. dbf3 tests (16-bit DOS in DOSBox)"
dos=$(mktemp -d)
(cd "$dos" && wcl -bt=dos -ms -0 -w4 -we -zq -k8192 -i=/graveyard/toolchain/lib -fe=DBF3TEST.EXE \
  /graveyard/toolchain/test/dbf3test.c /graveyard/toolchain/lib/dbf3.c)
toolchain/run-dos.sh "$dos" DBF3TEST.EXE
cp "$dos/OUT.TXT" fixtures/dbf3test/dos.txt
cat fixtures/dbf3test/dos.txt
grep -q '^ALL .* CHECKS PASSED$' fixtures/dbf3test/dos.txt

echo "== 3. build samples and compare with the committed dist/"
OUT=/tmp/dist toolchain/build.sh
if ! diff -r /tmp/dist dist > /dev/null; then
  echo "dist/ is out of date. Run pnpm graveyard:build and commit the result."
  diff -rq /tmp/dist dist || true
  exit 1
fi
echo "dist/ is up to date"

echo "== 4. run HELLO.EXE in DOSBox"
run=$(mktemp -d)
cp dist/hello/HELLO.EXE "$run/"
toolchain/run-dos.sh "$run" HELLO.EXE
cat "$run/OUT.TXT"
# Check what the program printed: a crash (for example a stack overflow) prints nothing here.
grep -q '^HELLO FROM 1998$' "$run/OUT.TXT"
grep -q '^READ 2 RECORDS: PAN500 45.50, ASP100 12.00$' "$run/OUT.TXT"
test "$(stat -c %s "$run/HELLO.DBF")" = 128
cp "$run/OUT.TXT" "$run/HELLO.DBF" fixtures/hello/
echo "toolchain test PASSED"
