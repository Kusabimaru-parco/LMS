# Campus LMS installer for Windows Server 2019/2022/2025 and Windows 10/11 (no Docker).
# Needs: Node.js 20+ (22 LTS recommended) and PostgreSQL 14+ on this machine.
# Run as Administrator with install-windows.cmd (right-click > Run as administrator).
#
# It creates the database (UTF-8), writes .env with fresh secrets (readable by administrators only),
# builds the app, registers it as a service that starts with Windows and restarts if it stops,
# opens the firewall port (optional) and schedules nightly backups.
param([string]$AppDir = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path, [int]$Port = 0, [switch]$Yes)
. (Join-Path $PSScriptRoot "common.ps1")
Set-Location -LiteralPath $AppDir
$version = Get-AppVersion $AppDir

Write-Bold "Campus LMS $version installer for Windows"
Write-Host ""

# ---------------------------------------------------------------- 1. Pre-flight checks
if (-not (Test-Admin)) { Fail "Run this as Administrator (right-click install-windows.cmd > Run as administrator)." }
if (Test-Path (Join-Path $AppDir ".env")) { Fail "Campus LMS is already installed here (.env exists). To upgrade, run: lms.cmd update" }

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) { Fail "Node.js is not installed. Install the LTS version (https://nodejs.org) for all users, then run this again." }
$nodeMajor = [int](& node -p "process.versions.node.split('.')[0]")
if ($nodeMajor -lt 20) { Fail "Node.js 20 or newer is required (found $(& node --version))." }
if ($nodeCmd.Source -like "*\AppData\*") { Write-Warn "Node.js is installed for one user only ($($nodeCmd.Source)). The service runs as SYSTEM: install Node.js for all users." }

$psql = Get-PgTool "psql"
if (-not $psql) { Fail "PostgreSQL is not installed. Install it from https://www.postgresql.org/download/windows/ and run this again." }
if (-not (Get-PgTool "pg_dump")) { Write-Warn "pg_dump wasn't found, so backups won't work. Add PostgreSQL's bin folder to PATH." }

$os = Get-CimInstance Win32_OperatingSystem
$freeGb = [Math]::Round((Get-PSDrive ((Get-Item $AppDir).PSDrive.Name)).Free / 1GB, 1)
Write-Info ("Windows: " + $os.Caption + " | memory: " + [Math]::Round($os.TotalVisibleMemorySize / 1MB, 1) + " GB | free disk: $freeGb GB")
if ($freeGb -lt 6) { Write-Warn "Less than 6 GB of free disk space. Uploads and backups need room to grow." }

# ---------------------------------------------------------------- 2. Questions
if ($Port -eq 0) {
  $answer = if ($Yes) { "" } else { Read-Host "Port to use [3000]" }
  $Port = if ($answer) { [int]$answer } else { 3000 }
}
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { Fail "Port $Port is already in use by another program. Choose another port." }

Write-Host ""
Write-Host "Campus LMS needs its own database user and database."
Write-Host "Enter the password of the 'postgres' superuser (chosen when PostgreSQL was installed)."
$secure = Read-Host "PostgreSQL 'postgres' password" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }

# ---------------------------------------------------------------- 3. Database
function New-Random([string]$alphabet, [int]$length) {
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  $bytes = New-Object byte[] $length
  $rng.GetBytes($bytes)
  -join ($bytes | ForEach-Object { $alphabet[$_ % $alphabet.Length] })
}
$alnum = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
$codeChars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
$dbPassword = New-Random $alnum 32
$setupCode = "{0}-{1}-{2}" -f (New-Random $codeChars 4), (New-Random $codeChars 4), (New-Random $codeChars 4)

function Invoke-Psql([string]$sql) {
  $out = & $psql -h localhost -U postgres -d postgres -v ON_ERROR_STOP=1 -tAc $sql 2>&1
  if ($LASTEXITCODE -ne 0) { $env:PGPASSWORD = $null; Fail "PostgreSQL said: $out" }
  return "$out".Trim()
}
Write-Bold "Creating the database..."
if ((Invoke-Psql "SELECT 1 FROM pg_database WHERE datname = 'campus_lms'") -eq "1") {
  $env:PGPASSWORD = $null
  Fail "A database named campus_lms already exists. Remove it first, or keep using the install that owns it."
}
if ((Invoke-Psql "SELECT 1 FROM pg_roles WHERE rolname = 'lms'") -eq "1") {
  Invoke-Psql "ALTER ROLE lms WITH LOGIN PASSWORD '$dbPassword'" | Out-Null
} else {
  Invoke-Psql "CREATE ROLE lms WITH LOGIN PASSWORD '$dbPassword'" | Out-Null
}
# UTF-8 is required (accents, emoji, maths symbols). Use template0 + C locale if the server default isn't UTF-8.
if ((Invoke-Psql "SELECT pg_encoding_to_char(encoding) FROM pg_database WHERE datname = 'template1'") -eq "UTF8") {
  Invoke-Psql "CREATE DATABASE campus_lms OWNER lms" | Out-Null
} else {
  Invoke-Psql "CREATE DATABASE campus_lms OWNER lms ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C'" | Out-Null
}
$env:PGPASSWORD = $null

# ---------------------------------------------------------------- 4. Settings (.env, administrators only)
$authSecret = New-Random $alnum 48
$envPath = Join-Path $AppDir ".env"
$envText = @"
# Created by the Windows installer on $((Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")). Keep this file private and back it up:
# without AUTH_SECRET, stored integration passwords can't be decrypted.
DATABASE_URL="postgresql://lms:$dbPassword@localhost:5432/campus_lms"
AUTH_SECRET="$authSecret"
SETUP_CODE="$setupCode"
APP_URL=""
PORT="$Port"
DEMO_MODE="false"
UPLOAD_DIR="$(Join-Path $AppDir 'data\uploads')"
MAX_UPLOAD_MB="50"
BACKUP_KEEP="14"
UPDATE_FEED_URL=""
"@
[IO.File]::WriteAllText($envPath, $envText, (New-Object Text.UTF8Encoding $false))
Protect-EnvFile $envPath
New-Item -ItemType Directory -Force (Join-Path $AppDir "data\uploads"), (Join-Path $AppDir "backups"), (Join-Path $AppDir "logs") | Out-Null
Write-Info "Saved settings to .env (readable by administrators only)"

# ---------------------------------------------------------------- 5. Build, service, firewall, backups
foreach ($k in (Read-DotEnv $envPath).Keys) { [Environment]::SetEnvironmentVariable($k, (Read-DotEnv $envPath)[$k], "Process") }
try { Build-App $AppDir } catch { Fail $_ }
Push-Location $AppDir
try { Invoke-Step "Creating the database tables..." { & npx prisma migrate deploy } } catch { Fail $_ } finally { Pop-Location }

Register-LmsService $AppDir
Write-Info "Registered the 'Campus LMS' service (starts with Windows, restarts if it stops)"
Register-BackupTask $AppDir
Write-Info "Nightly backups at 02:30 into $(Join-Path $AppDir 'backups')"

$fw = if ($Yes) { "y" } else { Read-Host "Allow port $Port through Windows Firewall so other devices can connect? (y/n) [y]" }
if (-not $fw -or $fw -eq "y") {
  New-NetFirewallRule -DisplayName "Campus LMS (port $Port)" -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow -Profile Domain,Private | Out-Null
  Write-Info "Firewall: allowed port $Port on domain and private networks"
}

Start-LmsServer $AppDir
Write-Host -NoNewline "Waiting for the app to start"
$h = Wait-Healthy $Port 180
Write-Host ""
if (-not $h) { Fail "The app didn't start. See the newest file in $(Join-Path $AppDir 'logs')" }

$ip = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" -and $_.InterfaceAlias -notlike "vEthernet*" } |
  Select-Object -First 1 -ExpandProperty IPAddress
Write-Host ""
Write-Bold "Campus LMS $version is running."
Write-Host "  1. Open:        http://localhost:$Port/setup   (other devices: http://${ip}:$Port/setup)"
Write-Host "  2. Setup code:  $setupCode"
Write-Host ""
Write-Host "Manage it with:  lms.cmd status | backup | update | rollback | help"
Write-Host "For HTTPS with a domain, see docs/INSTALL.md (IIS or Caddy in front of port $Port)."
