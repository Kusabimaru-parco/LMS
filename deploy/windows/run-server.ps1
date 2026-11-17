# Runs Campus LMS and restarts it if it stops (started by the "Campus LMS" scheduled task).
# Applies database migrations first, so a new version upgrades itself on start.
param([Parameter(Mandatory = $true)][string]$AppDir)
. (Join-Path $PSScriptRoot "common.ps1")
$ErrorActionPreference = "Continue"
Set-Location -LiteralPath $AppDir

$logs = Join-Path $AppDir "logs"
New-Item -ItemType Directory -Force $logs | Out-Null
Get-ChildItem $logs -Filter "server-*.log" | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-14) } | Remove-Item -Force

# Settings from .env become environment variables for Node.
$cfg = Read-DotEnv (Join-Path $AppDir ".env")
foreach ($k in $cfg.Keys) { [Environment]::SetEnvironmentVariable($k, $cfg[$k], "Process") }
$env:NODE_ENV = "production"
$env:HOSTNAME = "0.0.0.0"
if (-not $env:PORT) { $env:PORT = "3000" }
if (-not $env:UPLOAD_DIR) { $env:UPLOAD_DIR = Join-Path $AppDir "data\uploads" }

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { $node = Join-Path $env:ProgramFiles "nodejs\node.exe" }
$stopFlag = Join-Path $AppDir ".update\stop"
$fast = 0

function Log($msg) { Add-Content -Path (Join-Path $logs ("server-" + (Get-Date -Format yyyyMMdd) + ".log")) -Value ("[" + (Get-Date -Format s) + "] " + $msg) }

Log "Applying database migrations..."
$log = Join-Path $logs ("server-" + (Get-Date -Format yyyyMMdd) + ".log")
& cmd.exe /c "`"$node`" node_modules\prisma\build\index.js migrate deploy >> `"$log`" 2>&1"

while (-not (Test-Path $stopFlag)) {
  $log = Join-Path $logs ("server-" + (Get-Date -Format yyyyMMdd) + ".log")
  Log "Starting Campus LMS on port $($env:PORT)"
  $started = Get-Date
  & cmd.exe /c "`"$node`" .next\standalone\server.js >> `"$log`" 2>&1"
  if (Test-Path $stopFlag) { break }
  Log "The server stopped (exit code $LASTEXITCODE). Restarting..."
  # Back off if it keeps crashing right away, so logs don't flood.
  if (((Get-Date) - $started).TotalSeconds -lt 30) { $fast++ } else { $fast = 0 }
  Start-Sleep -Seconds ([Math]::Min(60, 5 + $fast * 10))
}
Log "Stopped."
