# Push a branch (the pre-push hook runs pnpm verify), open its PR and merge it, then update main.
# Run pnpm ci:local first: that is the merge rule (tech.md). Windows PowerShell 5.1 or later.
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/push-merge.ps1 -Branch <b> -Title <t> -Body <b>
param(
  [Parameter(Mandatory = $true)][string]$Branch,
  [Parameter(Mandatory = $true)][string]$Title,
  [string]$Body = ''
)
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
Set-Location (Split-Path -Parent $PSScriptRoot)
$log = Join-Path $env:TEMP "push-$($Branch -replace '[/\\]', '-').txt"
git push -u origin $Branch *> $log
if ($LASTEXITCODE -ne 0) {
  'PUSH FAILED (pre-push hook ran pnpm verify)'
  Get-Content $log -Tail 30
  exit 1
}
Get-Content $log | Select-String 'Tests  |passed \(|failed|->' | ForEach-Object Line
$url = gh pr create --base main --head $Branch --title $Title --body $Body
if ($LASTEXITCODE -ne 0 -or -not $url) { "PR CREATE FAILED for $Branch"; exit 1 }
$num = ($url -split '/')[-1]
gh pr merge $num --merge --subject "Merge #${num}: $Title" *> (Join-Path $env:TEMP 'merge.txt')
if ($LASTEXITCODE -ne 0) {
  "MERGE FAILED on #$num"
  Get-Content (Join-Path $env:TEMP 'merge.txt')
  exit 1
}
"PR #$num merged"
git checkout -q main
git pull -q --ff-only
git log --oneline -1
