# Campus LMS management command for Windows. Run through lms.cmd as Administrator.
#
#   lms status                       service, version and health
#   lms start | stop | restart
#   lms logs                         show the newest log (follows it)
#   lms backup [label]               database + uploaded files + .env into .\backups (keeps BACKUP_KEEP)
#   lms restore <file.dump>          restore a backup (asks for confirmation)
#   lms update [-From release.zip|folder]
#                                    build the new version beside the running one, back up, switch,
#                                    check health, and roll back automatically if it doesn't start.
#                                    Without -From: rebuild the files already copied into this folder.
#   lms rollback                     go back to the version before the last update (code + database)
#   lms install-service              (re)register the service and nightly backup task
#   lms version | setup-code
param([Parameter(Position = 0)][string]$Command = "help", [Parameter(Position = 1)][string]$Arg, [string]$From, [switch]$Yes)
. (Join-Path $PSScriptRoot "common.ps1")
$AppDir = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location -LiteralPath $AppDir
$envPath = Join-Path $AppDir ".env"
$state = Join-Path $AppDir ".update"
$backups = Join-Path $AppDir "backups"

if ($Command -ne "help" -and -not (Test-Path $envPath)) { Fail "Campus LMS isn't installed in $AppDir (no .env). Run install-windows.cmd first." }
if ($Command -notin @("help", "version", "status", "logs", "setup-code") -and -not (Test-Admin)) { Fail "Run this as Administrator." }
New-Item -ItemType Directory -Force $state, $backups | Out-Null
$cfg = Read-DotEnv $envPath
$port = Get-Port $AppDir

# ---------------------------------------------------------------- backup / restore
function Invoke-Backup([string]$label = "manual") {
  $pgDump = Get-PgTool "pg_dump"
  if (-not $pgDump) { Fail "pg_dump wasn't found. Add PostgreSQL's bin folder to PATH." }
  $version = Get-AppVersion $AppDir
  $base = Join-Path $backups ("campus-lms-$version-" + (Get-Date -Format "yyyyMMdd-HHmmss") + "-$label")
  Write-Bold "Backing up to $base.*"
  & $pgDump --dbname=$($cfg.DATABASE_URL) -Fc -f "$base.dump"
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path "$base.dump")) { Fail "The database backup failed." }
  $uploads = Join-Path $AppDir "data\uploads"
  if (Test-Path $uploads) {
    & tar.exe -czf "$base-uploads.tar.gz" -C (Join-Path $AppDir "data") uploads
    if ($LASTEXITCODE -ne 0) { Fail "Backing up uploaded files failed." }
  }
  Copy-Item $envPath "$base.env"
  Protect-EnvFile "$base.env"
  $keep = 14; if ($cfg.BACKUP_KEEP) { $keep = [int]$cfg.BACKUP_KEEP }
  Get-ChildItem $backups -Filter "campus-lms-*.dump" | Sort-Object LastWriteTime -Descending | Select-Object -Skip $keep | ForEach-Object {
    $b = $_.FullName -replace '\.dump$', ''
    Remove-Item -Force "$b.dump", "$b-uploads.tar.gz", "$b.env" -ErrorAction SilentlyContinue
  }
  Write-Info ("Database: {0:N1} MB" -f ((Get-Item "$base.dump").Length / 1MB))
  return $base
}

function Invoke-Restore([string]$file, [switch]$Force) {
  if (-not $file -or -not (Test-Path $file)) { Fail "Usage: lms restore backups\<name>.dump" }
  $base = $file -replace '\.dump$', ''
  if (-not $Force) {
    Write-Warn "This replaces ALL current data with $file."
    if ((Read-Host "Type RESTORE to continue") -ne "RESTORE") { Fail "Cancelled." }
  }
  $pgRestore = Get-PgTool "pg_restore"
  if (-not $pgRestore) { Fail "pg_restore wasn't found. Add PostgreSQL's bin folder to PATH." }
  Write-Bold "Restoring $file"
  Stop-LmsServer $AppDir
  & $pgRestore --dbname=$($cfg.DATABASE_URL) --clean --if-exists --no-owner --single-transaction $file
  if ($LASTEXITCODE -ne 0) { Fail "pg_restore failed. The database was left unchanged." }
  if (Test-Path "$base-uploads.tar.gz") {
    $uploads = Join-Path $AppDir "data\uploads"
    Remove-Item -Recurse -Force $uploads -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force (Join-Path $AppDir "data") | Out-Null
    & tar.exe -xzf "$base-uploads.tar.gz" -C (Join-Path $AppDir "data")
    Write-Info "Uploaded files restored."
  }
  Start-LmsServer $AppDir
  if (Wait-Healthy $port 180) { Write-Bold "Restore finished." } else { Fail "Restored, but the app didn't start. See: lms logs" }
}

# ---------------------------------------------------------------- update / rollback
# Folders that hold the school's data. They are never copied over, emptied or deleted by updates.
$dataDirs = @("data", "backups", "logs", ".update", ".git")
# Folders that belong to the app code and are replaced as a whole on update/rollback.
$codeDirs = @(".next", "node_modules", "src", "prisma", "public", "scripts", "deploy", "docs", ".claude")

function Invoke-Robocopy($src, $dst) {
  # /E copies everything (no purge, so nothing in the destination is ever deleted by robocopy).
  & robocopy $src $dst /E /NFL /NDL /NJH /NJS /NP /R:2 /W:2 /XD @($dataDirs | ForEach-Object { Join-Path $src $_ }) /XF .env | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "Copying files failed (robocopy $LASTEXITCODE)." }
  $global:LASTEXITCODE = 0
}

# A fresh copy of the app code (for rollback or staging). The destination is emptied first.
function Save-AppFiles($src, $dst) {
  Remove-Item -Recurse -Force $dst -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force $dst | Out-Null
  Invoke-Robocopy $src $dst
}

# Puts a version's code into the install folder: replaces the code folders, keeps data and .env.
function Install-AppFiles($src, $dst) {
  foreach ($d in $codeDirs) { Remove-Item -Recurse -Force (Join-Path $dst $d) -ErrorAction SilentlyContinue }
  Invoke-Robocopy $src $dst
}

function Invoke-Update([string]$from) {
  $old = Get-AppVersion $AppDir
  Write-Bold "Updating Campus LMS (current version $old)"
  $staging = Join-Path $state "staging"
  $previous = Join-Path $state "previous"

  if ($from) {
    # 1. Prepare the new version beside the running one
    Remove-Item -Recurse -Force $staging -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force $staging | Out-Null
    if (Test-Path $from -PathType Container) { Save-AppFiles (Resolve-Path $from).Path $staging }
    else { Expand-Archive -Path $from -DestinationPath $staging -Force }
    $pkg = Get-ChildItem $staging -Recurse -Depth 2 -Filter package.json | Select-Object -First 1
    if (-not $pkg) { Fail "$from doesn't contain Campus LMS." }
    $src = $pkg.Directory.FullName
    $new = Get-AppVersion $src
    Copy-Item $envPath (Join-Path $src ".env")
    foreach ($k in $cfg.Keys) { [Environment]::SetEnvironmentVariable($k, $cfg[$k], "Process") }
    Write-Bold "Building version $new (the current version keeps running meanwhile)..."
    try { Build-App $src } catch { Remove-Item -Recurse -Force $staging; Fail "The build failed, so nothing was changed. $_" }
    Remove-Item -Force (Join-Path $src ".env")

    # 2. Keep the current version for rollback, then back up and switch
    Write-Info "Saving the current version for rollback..."
    Save-AppFiles $AppDir $previous
    Set-Content (Join-Path $state "previous-version") $old
    $backup = Invoke-Backup "before-$new"
    Set-Content (Join-Path $state "previous-backup") $backup
    Write-Bold "Switching to version $new..."
    Stop-LmsServer $AppDir
    Install-AppFiles $src $AppDir
    Remove-Item -Recurse -Force $staging -ErrorAction SilentlyContinue
  } else {
    # In-place: the new files were already copied over this folder.
    $new = $old
    Set-Content (Join-Path $state "previous-version") $old
    Stop-LmsServer $AppDir
    $backup = Invoke-Backup "before-$new"
    Set-Content (Join-Path $state "previous-backup") $backup
    foreach ($k in $cfg.Keys) { [Environment]::SetEnvironmentVariable($k, $cfg[$k], "Process") }
    try { Build-App $AppDir } catch { Fail "The build failed: $_. Restore the previous files and run lms start." }
  }

  # 3. Start (migrations run first) and check health
  Start-LmsServer $AppDir
  $h = Wait-Healthy $port 240
  if ($h -and $h.version -eq $new) {
    Write-Bold "Updated to Campus LMS $new."
    Write-Info "If anything looks wrong, run: lms rollback"
  } else {
    Write-Warn "Version $new didn't start correctly. Rolling back automatically."
    Invoke-Rollback -Force
    Fail "The update was rolled back. Nothing was lost. Send the newest file in .\logs to support."
  }
}

function Invoke-Rollback([switch]$Force) {
  $previous = Join-Path $state "previous"
  $prevVersion = Get-Content (Join-Path $state "previous-version") -ErrorAction SilentlyContinue
  $backup = Get-Content (Join-Path $state "previous-backup") -ErrorAction SilentlyContinue
  if (-not $prevVersion) { Fail "There's no previous version to go back to." }
  if (-not $Force) {
    Write-Warn "This goes back to version $prevVersion and restores the database from just before the update."
    Write-Warn "Anything people did after the update will be lost."
    if ((Read-Host "Type ROLLBACK to continue") -ne "ROLLBACK") { Fail "Cancelled." }
  }
  Stop-LmsServer $AppDir
  if (Test-Path $previous) { Install-AppFiles $previous $AppDir }
  if ($backup -and (Test-Path "$backup.dump")) { Invoke-Restore "$backup.dump" -Force }
  else { Start-LmsServer $AppDir; if (-not (Wait-Healthy $port 180)) { Fail "Rolled back, but the app didn't start. See: lms logs" } }
  Write-Bold "Back on Campus LMS $prevVersion."
}

# ---------------------------------------------------------------- commands
switch ($Command) {
  "status" {
    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Write-Info ("Service:  " + $(if ($task) { $task.State } else { "not registered (run: lms install-service)" }))
    Write-Info ("Installed version: " + (Get-AppVersion $AppDir))
    $h = Get-Health $port
    Write-Info ("Running:  " + $(if ($h) { "version $($h.version), status $($h.status) on port $port" } else { "not responding on port $port" }))
    $newest = Get-ChildItem $backups -Filter *.dump -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    Write-Info ("Newest backup: " + $(if ($newest) { $newest.Name } else { "none" }))
  }
  "start" { Start-LmsServer $AppDir; if (Wait-Healthy $port 120) { Write-Bold "Running on port $port." } else { Write-Warn "Not responding yet. See: lms logs" } }
  "stop" { Stop-LmsServer $AppDir; Write-Bold "Stopped." }
  "restart" { Stop-LmsServer $AppDir; Start-LmsServer $AppDir; if (Wait-Healthy $port 120) { Write-Bold "Restarted." } }
  "logs" {
    $f = Get-ChildItem (Join-Path $AppDir "logs") -Filter "server-*.log" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($f) { Get-Content $f.FullName -Tail 200 -Wait } else { Write-Info "No logs yet." }
  }
  "backup" { $label = "manual"; if ($Arg) { $label = $Arg }; Invoke-Backup $label | Out-Null }
  "restore" { Invoke-Restore $Arg -Force:$Yes }
  "update" { $src = $From; if (-not $src) { $src = $Arg }; Invoke-Update $src }
  "rollback" { Invoke-Rollback -Force:$Yes }
  "install-service" { Register-LmsService $AppDir; Register-BackupTask $AppDir; Write-Bold "Service and nightly backup registered. Start it with: lms start" }
  "version" { Get-AppVersion $AppDir }
  "setup-code" { $cfg.SETUP_CODE }
  default { Get-Content $PSCommandPath | Select-Object -Skip 1 -First 15 | ForEach-Object { $_ -replace '^# ?', '' } }
}
