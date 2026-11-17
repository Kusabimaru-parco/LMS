# Shared helpers for the Campus LMS Windows scripts. Windows PowerShell 5.1 compatible (no && or ??).

$ErrorActionPreference = "Stop"
$TaskName = "Campus LMS"
$BackupTaskName = "Campus LMS backup"

function Write-Bold($text) { Write-Host $text -ForegroundColor Cyan }
function Write-Info($text) { Write-Host "  $text" }
function Write-Warn($text) { Write-Host "Warning: $text" -ForegroundColor Yellow }
function Fail($text) { Write-Host "Error: $text" -ForegroundColor Red; exit 1 }

function Test-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  return (New-Object Security.Principal.WindowsPrincipal $id).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Invoke-Step($label, [scriptblock]$block) {
  Write-Bold $label
  & $block
  if ($LASTEXITCODE -ne 0) { throw "$label failed (exit code $LASTEXITCODE)." }
}

function Read-DotEnv($path) {
  $map = @{}
  if (-not (Test-Path -LiteralPath $path)) { return $map }
  foreach ($line in Get-Content -LiteralPath $path) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
      $map[$Matches[1]] = $Matches[2].Trim().Trim('"')
    }
  }
  return $map
}

function Set-DotEnvValue($path, $key, $value) {
  $lines = @()
  if (Test-Path -LiteralPath $path) { $lines = @(Get-Content -LiteralPath $path) }
  $found = $false
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match "^\s*$key\s*=") { $lines[$i] = "$key=""$value"""; $found = $true }
  }
  if (-not $found) { $lines += "$key=""$value""" }
  [IO.File]::WriteAllText($path, (($lines -join "`r`n") + "`r`n"), (New-Object Text.UTF8Encoding $false))
}

function Get-PgTool($name) {
  $cmd = Get-Command $name -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $hit = Get-ChildItem "$env:ProgramFiles\PostgreSQL\*\bin\$name.exe" -ErrorAction SilentlyContinue |
    Sort-Object { [int]($_.Directory.Parent.Name -replace '\D', '') } -Descending | Select-Object -First 1
  if ($hit) { return $hit.FullName }
  return $null
}

function Get-AppVersion($dir) {
  return (Get-Content -LiteralPath (Join-Path $dir "package.json") -Raw | ConvertFrom-Json).version
}

function Get-Port($dir) {
  $cfg = Read-DotEnv (Join-Path $dir ".env")
  if ($cfg.PORT) { return [int]$cfg.PORT }
  return 3000
}

function Get-Health($port) {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$port/api/health" -TimeoutSec 5
    return ($r.Content | ConvertFrom-Json)
  } catch { return $null }
}

function Wait-Healthy($port, [int]$seconds = 180) {
  $until = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $until) {
    $h = Get-Health $port
    if ($h -and $h.status -eq "ok") { return $h }
    Start-Sleep -Seconds 3
  }
  return $null
}

function Stop-LmsServer($dir) {
  $flag = Join-Path $dir ".update\stop"
  New-Item -ItemType Directory -Force (Split-Path $flag) | Out-Null
  New-Item -ItemType File -Force $flag | Out-Null
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  $pattern = [Regex]::Escape($dir)
  Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object { $_.CommandLine -match $pattern } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 2
}

function Start-LmsServer($dir) {
  Remove-Item -Force (Join-Path $dir ".update\stop") -ErrorAction SilentlyContinue
  if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Start-ScheduledTask -TaskName $TaskName
  } else {
    Fail "The Campus LMS service isn't registered. Run: lms.cmd install-service"
  }
}

function Build-App($dir) {
  Push-Location $dir
  try {
    Invoke-Step "Installing packages (a few minutes)..." { & npm ci --no-audit --no-fund }
    Invoke-Step "Building the app (a few minutes)..." { & npm run build }
    # The standalone server needs the static files and public folder next to it.
    $sa = Join-Path $dir ".next\standalone"
    if (-not (Test-Path $sa)) { throw "The build didn't produce .next\standalone." }
    Copy-Item -Recurse -Force (Join-Path $dir ".next\static") (Join-Path $sa ".next\static")
    if (Test-Path (Join-Path $dir "public")) { Copy-Item -Recurse -Force (Join-Path $dir "public") (Join-Path $sa "public") }
  } finally { Pop-Location }
}

function Register-LmsService($dir) {
  $ps = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
  $runner = Join-Path $dir "deploy\windows\run-server.ps1"
  $action = New-ScheduledTaskAction -Execute $ps -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$runner`" -AppDir `"$dir`"" -WorkingDirectory $dir
  $trigger = New-ScheduledTaskTrigger -AtStartup
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
    -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
  $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
    -Description "Runs the Campus LMS web server (restarts it if it stops)." -Force | Out-Null
}

function Register-BackupTask($dir) {
  $ps = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
  $cli = Join-Path $dir "deploy\windows\lms.ps1"
  $action = New-ScheduledTaskAction -Execute $ps -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$cli`" backup nightly" -WorkingDirectory $dir
  $trigger = New-ScheduledTaskTrigger -Daily -At 2:30am
  $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
  Register-ScheduledTask -TaskName $BackupTaskName -Action $action -Trigger $trigger -Principal $principal `
    -Description "Nightly Campus LMS backup (database and uploaded files)." -Force | Out-Null
}

function Protect-EnvFile($path) {
  # Only administrators and the service account may read the secrets.
  & icacls $path /inheritance:r /grant:r "*S-1-5-18:(R)" "*S-1-5-32-544:(F)" | Out-Null
}
