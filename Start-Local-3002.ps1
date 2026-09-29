$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
& node --import tsx scripts/local-3002.mjs
if ($LASTEXITCODE -ne 0) { throw "Qmulate local startup failed (exit $LASTEXITCODE)." }
