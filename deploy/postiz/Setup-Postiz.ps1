# Setup-Postiz.ps1 — one-shot Postiz installer for the Sugimoto Windows PC.
#
# Run in a NORMAL PowerShell window (not admin) after Docker Desktop is
# installed and running:
#
#     cd $env:USERPROFILE\Downloads
#     .\Setup-Postiz.ps1
#
# It checks the machine, fetches Postiz, writes a config with your settings and
# a freshly generated secret, and starts the stack. Safe to re-run: it never
# overwrites an existing config, so your keys and secret survive.

$ErrorActionPreference = 'Stop'
$ProjectDir = Join-Path $env:USERPROFILE 'projects\postiz-app'
$Domain     = 'https://post.sugimotogroup.org'

function Fail($msg) { Write-Host "`n  STOP: $msg`n" -ForegroundColor Red; exit 1 }
function Ok($msg)   { Write-Host "  OK   $msg" -ForegroundColor Green }
function Info($msg) { Write-Host "  ..   $msg" -ForegroundColor Cyan }

Write-Host "`n=== Checking this PC ===" -ForegroundColor White

if ($env:PROCESSOR_ARCHITECTURE -ne 'AMD64') {
  Fail "This PC is $env:PROCESSOR_ARCHITECTURE. Postiz publishes no ARM build, so it cannot run here."
}
Ok "Processor is AMD64"

$ramGB = [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB, 1)
if ($ramGB -lt 7.5) {
  Fail "This PC has $ramGB GB RAM. Windows needs 2-3 GB before Postiz starts, so 8 GB is the floor. Tell Claude and use the n8n fallback instead."
}
Ok "RAM is $ramGB GB"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Fail "'docker' not found. Install Docker Desktop first, then re-run this script."
}
Ok "docker is installed"


try { docker info 2>&1 | Out-Null; if ($LASTEXITCODE -ne 0) { throw } }
catch { Fail "Docker Desktop is installed but not running. Start it, wait for the whale icon to settle, then re-run." }
Ok "Docker Desktop is running"

Write-Host "`n=== Fetching Postiz ===" -ForegroundColor White
# Downloaded as a zip rather than cloned, so Git is not a prerequisite.
if (Test-Path (Join-Path $ProjectDir 'docker-compose.yaml')) {
  Info "Already downloaded, leaving it in place"
} else {
  $parent = Split-Path $ProjectDir
  New-Item -ItemType Directory -Force -Path $parent | Out-Null
  $zip = Join-Path $parent 'postiz.zip'
  Info "Downloading (about 100 MB)"
  Invoke-WebRequest -Uri 'https://github.com/gitroomhq/postiz-app/archive/refs/heads/main.zip' -OutFile $zip
  Info "Extracting"
  Expand-Archive -Path $zip -DestinationPath $parent -Force
  if (Test-Path $ProjectDir) { Remove-Item $ProjectDir -Recurse -Force }
  Rename-Item (Join-Path $parent 'postiz-app-main') $ProjectDir
  Remove-Item $zip -Force
}
Ok "Postiz is in $ProjectDir"

Set-Location $ProjectDir
$compose = Join-Path $ProjectDir 'docker-compose.yaml'

if (Test-Path (Join-Path $ProjectDir 'docker-compose.CONFIGURED.yaml')) {
  Info "Existing config found - leaving your secret and platform keys untouched"
} else {
  Write-Host "`n=== Writing your configuration ===" -ForegroundColor White

  # A fresh 32-byte secret. Rotating this logs everyone out, so it is written once.
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $jwt = [Convert]::ToBase64String($bytes)

  $text = Get-Content $compose -Raw

  $text = $text -replace "MAIN_URL: 'http://localhost:4007'",             "MAIN_URL: '$Domain'"
  $text = $text -replace "FRONTEND_URL: 'http://localhost:4007'",         "FRONTEND_URL: '$Domain'"
  $text = $text -replace "NEXT_PUBLIC_BACKEND_URL: 'http://localhost:4007/api'", "NEXT_PUBLIC_BACKEND_URL: '$Domain/api'"
  $text = $text -replace "JWT_SECRET: '[^']*'",                           "JWT_SECRET: '$jwt'"

  # Trim the three optional containers: Sentry debugging, the Temporal CLI image
  # and the Temporal dashboard. Postiz only needs the temporal server itself.
  foreach ($svc in @('spotlight','temporal-admin-tools','temporal-ui')) {
    $text = [regex]::Replace($text, "(?ms)^  $svc :?\r?\n.*?(?=^  [a-z]|^volumes:)", '', 'IgnoreCase')
  }

  Set-Content -Path $compose -Value $text -NoNewline -Encoding UTF8
  Copy-Item $compose (Join-Path $ProjectDir 'docker-compose.CONFIGURED.yaml')

  Ok "Domain set to $Domain"
  Ok "Fresh JWT secret generated"
  Ok "Trimmed 3 optional containers to save memory"
}

Write-Host "`n=== Starting Postiz (first run downloads several GB) ===" -ForegroundColor White
docker compose up -d
if ($LASTEXITCODE -ne 0) { Fail "Startup failed. Copy the red text above and send it to Claude." }

Write-Host "`n=== Waiting for the app to answer ===" -ForegroundColor White
$up = $false
foreach ($i in 1..40) {
  Start-Sleep -Seconds 15
  try {
    $r = Invoke-WebRequest -Uri 'http://localhost:4007' -UseBasicParsing -TimeoutSec 10
    if ($r.StatusCode -eq 200) { $up = $true; break }
  } catch { Info "still starting... ($($i*15)s)" }
}

if ($up) {
  Write-Host "`n  POSTIZ IS RUNNING -> http://localhost:4007`n" -ForegroundColor Green
  Write-Host "  Next: set up the Cloudflare Tunnel so $Domain reaches this PC." -ForegroundColor White
  Write-Host "  Do NOT create your account until the tunnel is live.`n" -ForegroundColor Yellow
} else {
  Write-Host "`n  Started, but no answer yet after 10 minutes." -ForegroundColor Yellow
  Write-Host "  Run: docker compose logs --tail 50 postiz" -ForegroundColor White
  Write-Host "  and send the output to Claude.`n"
}
