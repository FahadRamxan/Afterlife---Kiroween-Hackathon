#!/usr/bin/env bash
# Checks run-dos.sh's retry with a stand-in dosbox (no real DOS): a run that hangs once is retried
# from a fresh copy of its folder and passes; a run that always hangs fails with exit 124.
# Run by test.sh before the real DOSBox runs.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
fake=$(mktemp -d)
work=$(mktemp -d)
trap 'rm -rf "$fake" "$work"' EXIT
fail() { echo "retry-test: FAIL: $*" >&2; exit 1; }

# The stand-in reads the mounted folder from the conf, like DOSBox. With $work/hang-always it
# always hangs; else it hangs the first time only, after leaving junk in the folder.
cat > "$fake/dosbox" <<EOF
#!/usr/bin/env bash
dir=\$(sed -n 's/^mount c "\\(.*\\)"\$/\\1/p' "\$2")
if [ -f "$work/hang-always" ] || [ ! -f "$work/hung-once" ]; then
  touch "$work/hung-once"
  echo junk > "\$dir/JUNK.TXT"
  sleep 30
fi
echo HELLO > "\$dir/OUT.TXT"
EOF
chmod +x "$fake/dosbox"

run_dir=$(mktemp -d)
echo seed > "$run_dir/SEED.DAT"
log=$(PATH="$fake:$PATH" DOSBOX_TIMEOUT=2 bash "$here/run-dos.sh" "$run_dir" HELLO.EXE 2>&1) ||
  fail "a run that hangs once should pass on retry; got: $log"
grep -q 'retrying once from a fresh copy' <<< "$log" || fail "no retry line printed: $log"
[ "$(cat "$run_dir/OUT.TXT")" = HELLO ] || fail "the retry did not produce OUT.TXT"
[ -f "$run_dir/SEED.DAT" ] || fail "the fresh copy lost SEED.DAT"
[ ! -e "$run_dir/JUNK.TXT" ] || fail "the hung attempt's JUNK.TXT was not cleared"

touch "$work/hang-always"
set +e
PATH="$fake:$PATH" DOSBOX_TIMEOUT=2 bash "$here/run-dos.sh" "$run_dir" HELLO.EXE > /dev/null 2>&1
code=$?
set -e
[ "$code" = 124 ] || fail "a run that always hangs should exit 124, got $code"
rm -rf "$run_dir"
echo "retry-test: run-dos.sh retries a hung run once and gives up after a second hang: OK"
