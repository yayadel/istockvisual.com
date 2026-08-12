# Polls for file changes and auto-commits/pushes to GitHub

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $Root

$PollSec = 5
$DebounceSec = 10
$MinIntervalSec = 20
$lastBackup = [datetime]::MinValue
$changeSeenAt = $null

Write-Host "[watch] Auto-backup polling: $Root"
Write-Host "[watch] Poll ${PollSec}s, debounce ${DebounceSec}s. Ctrl+C to stop."

while ($true) {
	Start-Sleep -Seconds $PollSec

	if (-not (Test-Path ".git")) {
		Write-Warning "[watch] .git missing, stopping."
		break
	}

	$status = git status --porcelain 2>$null
	if (-not $status) {
		$changeSeenAt = $null
		continue
	}

	if (-not $changeSeenAt) {
		$changeSeenAt = Get-Date
		continue
	}

	$quietFor = ((Get-Date) - $changeSeenAt).TotalSeconds
	if ($quietFor -lt $DebounceSec) {
		continue
	}

	$sinceBackup = ((Get-Date) - $lastBackup).TotalSeconds
	if ($sinceBackup -lt $MinIntervalSec) {
		continue
	}

	Write-Host "[watch] Changes detected, backing up..."
	& (Join-Path $PSScriptRoot "backup-to-github.ps1") -Message "auto backup: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
	$lastBackup = Get-Date
	$changeSeenAt = $null
}
