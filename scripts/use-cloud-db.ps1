# Points the LOCAL web app (localhost + office LAN) at the authoritative cloud database.
#
# Copies DATABASE_URL and ACCESS_MATRIX_DATABASE_URL from the gitignored `.env.cloud` into `.env`,
# blanks the operator/worker credentials the web app refuses to boot with, and retires the
# fixture-only DEV_ADMIN_* variables (one account system: no local exemption). It holds no secret
# itself and prints none. Run from the repository root, then start the app with:
#
#   pnpm exec cross-env MIGRATOR_DATABASE_URL= SUPERUSER_DATABASE_URL= PGBOSS_DATABASE_URL= pnpm --filter web dev
#
# To go back to the embedded database, restore `.env` from `.env.example` and use the
# `scripts/dev-postgres.ts` chain documented in README.md.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $root '.env'
$cloudPath = Join-Path $root '.env.cloud'
if (-not (Test-Path $cloudPath)) { throw ".env.cloud not found next to .env (it is gitignored; ask the operator who provisioned the cloud database)." }

$cloud = @{}
foreach ($line in Get-Content $cloudPath) {
  if ($line -match '^\s*([A-Z_]+)=(.*)$') { $cloud[$Matches[1]] = $Matches[2] }
}
foreach ($required in 'DATABASE_URL', 'ACCESS_MATRIX_DATABASE_URL') {
  if (-not $cloud.ContainsKey($required) -or $cloud[$required] -eq '') { throw "$required is missing from .env.cloud" }
}

$out = New-Object System.Collections.Generic.List[string]
$seen = @{}
foreach ($line in Get-Content $envPath) {
  if ($line -match '^\s*([A-Z_]+)=') {
    $key = $Matches[1]
    switch ($key) {
      'DATABASE_URL'               { $out.Add('DATABASE_URL=' + $cloud['DATABASE_URL']); $seen[$key] = $true; continue }
      'ACCESS_MATRIX_DATABASE_URL' { $out.Add('ACCESS_MATRIX_DATABASE_URL=' + $cloud['ACCESS_MATRIX_DATABASE_URL']); $seen[$key] = $true; continue }
      'MIGRATOR_DATABASE_URL'      { $out.Add('# ' + $line + '   # operator only; never in the web runtime'); continue }
      'SUPERUSER_DATABASE_URL'     { $out.Add('# ' + $line + '   # operator only; never in the web runtime'); continue }
      'PGBOSS_DATABASE_URL'        { $out.Add('# ' + $line + '   # worker only; never in the web runtime'); continue }
      'DEV_ADMIN_EMAIL'            { $out.Add('# ' + $line + '   # retired: one account system, no local exemption'); continue }
      'DEV_ADMIN_PASSWORD'         { $out.Add('# ' + $line + '   # retired: one account system, no local exemption'); continue }
    }
  }
  $out.Add($line)
}
foreach ($key in 'DATABASE_URL', 'ACCESS_MATRIX_DATABASE_URL') {
  if (-not $seen.ContainsKey($key)) { $out.Add($key + '=' + $cloud[$key]) }
}
Set-Content -Path $envPath -Value $out -Encoding utf8
Write-Host "[use-cloud-db] .env now points DATABASE_URL and ACCESS_MATRIX_DATABASE_URL at the cloud database; operator/worker/DEV_ADMIN lines commented out."
