# Cursor hook: backup after agent edits (debounced via lock file)

$ErrorActionPreference = "SilentlyContinue"
$Root = if ($env:CURSOR_PROJECT_DIR) { $env:CURSOR_PROJECT_DIR } else { (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path }
$lock = Join-Path $Root ".git/auto-backup.lock"
$script = Join-Path $Root "scripts/backup-to-github.ps1"

if (-not (Test-Path $script)) { exit 0 }
if (-not (Test-Path (Join-Path $Root ".git"))) { exit 0 }

if (Test-Path $lock) {
	$age = (Get-Date) - (Get-Item $lock).LastWriteTime
	if ($age.TotalSeconds -lt 15) { exit 0 }
}

Set-Content -Path $lock -Value (Get-Date).ToString("o") -NoNewline
Start-Sleep -Seconds 2
& powershell -NoProfile -ExecutionPolicy Bypass -File $script -Message "auto backup (cursor): $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
exit 0
