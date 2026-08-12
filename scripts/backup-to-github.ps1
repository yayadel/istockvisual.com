# Auto-backup to GitHub — reads token from github_token (gitignored)

param(
	[string]$Message = ""
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

Set-Location $Root

if (-not (Test-Path ".git")) {
	Write-Error "Not a git repository: $Root"
}

$tokenFile = Join-Path $Root "github_token"
if (-not (Test-Path $tokenFile)) {
	Write-Error "Missing github_token file in project root."
}

$token = (Get-Content $tokenFile -Raw).Trim()
if (-not $token) {
	Write-Error "github_token is empty."
}

$remoteUrl = $null
try {
	$remoteUrl = git remote get-url origin 2>$null
} catch {
	$remoteUrl = $null
}

if (-not $remoteUrl) {
	git remote add origin "https://github.com/yayadel/istockvisual.com.git"
	$remoteUrl = git remote get-url origin
}

if ($remoteUrl -notmatch "github\.com") {
	Write-Error "Unexpected origin remote: $remoteUrl"
}

$authUrl = "https://x-access-token:${token}@github.com/yayadel/istockvisual.com.git"
git remote set-url origin $authUrl | Out-Null

try {
	$status = git status --porcelain
	if ($status) {
		git add -A
		# Drop empty accidental notepad files if present
		Get-ChildItem -File -Filter "*.txt" | Where-Object { $_.Length -eq 0 -and $_.Name -match 'Text Document|新建' } | ForEach-Object {
			git reset HEAD -- $_.Name 2>$null | Out-Null
			Remove-Item -Force $_.FullName -ErrorAction SilentlyContinue
		}

		if (-not $Message) {
			$Message = "auto backup: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
		}

		# Avoid requiring git config user.name/email (do not write git config)
		$env:GIT_AUTHOR_NAME = if ($env:GIT_AUTHOR_NAME) { $env:GIT_AUTHOR_NAME } else { "yayadel" }
		$env:GIT_AUTHOR_EMAIL = if ($env:GIT_AUTHOR_EMAIL) { $env:GIT_AUTHOR_EMAIL } else { "yayadel@users.noreply.github.com" }
		$env:GIT_COMMITTER_NAME = $env:GIT_AUTHOR_NAME
		$env:GIT_COMMITTER_EMAIL = $env:GIT_AUTHOR_EMAIL

		git commit -m $Message
		if ($LASTEXITCODE -ne 0) {
			Write-Error "git commit failed with exit code $LASTEXITCODE"
		}
		Write-Host "[backup] Committed: $Message"
	} else {
		Write-Host "[backup] No local changes to commit."
	}

	git push -u origin HEAD
	if ($LASTEXITCODE -ne 0) {
		Write-Error "git push failed with exit code $LASTEXITCODE"
	}
	Write-Host "[backup] Pushed to origin."
}
finally {
	git remote set-url origin "https://github.com/yayadel/istockvisual.com.git" | Out-Null
}
