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

		if (-not $Message) {
			$Message = "auto backup: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
		}

		git commit -m $Message | Out-Null
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
