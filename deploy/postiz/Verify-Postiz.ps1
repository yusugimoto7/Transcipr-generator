<#
.SYNOPSIS
  Brings the Postiz stack up and keeps correcting it until it serves traffic.

.DESCRIPTION
  Runs the diagnosis-and-repair loop that a first install needs, without a
  human watching it. Each pass checks one layer at a time -- temporal, then
  the Postiz backend, then the web endpoint -- applies the known fix for
  whatever is broken, and tries again.

  Failures it repairs automatically:

    * temporal exited (it races its database on a cold boot and gives up)
    * the Postiz backend never bound port 3000 because temporal was absent
      when NestJS ran TemporalRegister.onModuleInit
    * nginx 502 because the image proxies to "localhost", which resolves to
      ::1 while the Node processes listen on IPv4 only

  It never deletes volumes, so the database, accounts and uploads are safe.

.EXAMPLE
  .\Verify-Postiz.ps1
  .\Verify-Postiz.ps1 -MaxPasses 30 -Verbose
#>
[CmdletBinding()]
param(
    [string]$ProjectPath = $PSScriptRoot,
    [int]$MaxPasses = 20,
    [int]$DelaySeconds = 15,
    [int]$Port = 4007
)

$ErrorActionPreference = 'Continue'
if (-not $ProjectPath) { $ProjectPath = (Get-Location).Path }
Set-Location $ProjectPath

function Say([string]$msg, [string]$colour = 'Gray') {
    Write-Host ("[{0:HH:mm:ss}] {1}" -f (Get-Date), $msg) -ForegroundColor $colour
}

function Get-ContainerState([string]$name) {
    $fmt = '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}'
    $raw = docker inspect --format $fmt $name 2>$null
    if (-not $raw) { return [pscustomobject]@{ Status = 'missing'; Health = 'none' } }
    $bits = $raw.Trim() -split '\|'
    [pscustomobject]@{ Status = $bits[0]; Health = $bits[1] }
}

function Test-Backend {
    # Asks Node, from inside the container, whether anything answers on 3000.
    $js = 'fetch("http://127.0.0.1:3000/").then(r=>console.log(r.status)).catch(()=>console.log("DOWN"))'
    $out = docker compose exec -T postiz node -e $js 2>$null
    return ($out -match '^\d+$')
}

function Test-Web {
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:$Port" -UseBasicParsing -TimeoutSec 15
        return [int]$r.StatusCode
    } catch {
        if ($_.Exception.Response) { return [int]$_.Exception.Response.StatusCode }
        return 0
    }
}

function Repair-Nginx {
    # The image ships proxy_pass to localhost; force IPv4 and reload in place.
    $conf = docker compose exec -T postiz cat /etc/nginx/nginx.conf 2>$null
    if ($conf -match 'proxy_pass http://localhost') {
        Say 'nginx proxies to localhost (resolves to ::1) -- forcing IPv4' 'Yellow'
        docker compose exec -T postiz sed -i 's/localhost:/127.0.0.1:/g' /etc/nginx/nginx.conf 2>&1 | Out-Null
        docker compose exec -T postiz nginx -s reload 2>&1 | Out-Null
        return $true
    }
    return $false
}

Say "Postiz repair loop starting in $ProjectPath" 'Cyan'

if (-not (Test-Path (Join-Path $ProjectPath 'docker-compose.override.yaml'))) {
    Say 'docker-compose.override.yaml is missing -- restart ordering is not fixed.' 'Yellow'
    Say 'This script can still get the stack up, but it will not survive a reboot.' 'Yellow'
}

docker compose up -d 2>&1 | Out-Null

for ($pass = 1; $pass -le $MaxPasses; $pass++) {
    Say "--- pass $pass of $MaxPasses" 'Cyan'

    # Layer 1: temporal must exist and be serving, or the backend cannot boot.
    $temporal = Get-ContainerState 'temporal'
    if ($temporal.Status -ne 'running') {
        Say "temporal is '$($temporal.Status)' -- starting it" 'Yellow'
        docker compose up -d temporal 2>&1 | Out-Null
        Start-Sleep -Seconds $DelaySeconds
        continue
    }
    $health = docker compose exec -T temporal tctl --address temporal:7233 cluster health 2>&1
    if ($health -notmatch 'SERVING') {
        Say 'temporal is running but not serving yet -- waiting' 'Yellow'
        Start-Sleep -Seconds $DelaySeconds
        continue
    }

    # Layer 2: the backend binds 3000 only if temporal answered at init time.
    if (-not (Test-Backend)) {
        Say 'backend is not listening on 3000 -- restarting postiz' 'Yellow'
        docker compose restart postiz 2>&1 | Out-Null
        Start-Sleep -Seconds 90
        continue
    }

    # Layer 3: the browser-facing endpoint.
    $code = Test-Web
    if ($code -ge 200 -and $code -lt 400) {
        Say "Postiz is serving on http://localhost:$Port (HTTP $code)" 'Green'
        docker compose ps
        exit 0
    }

    if ($code -eq 502) {
        if (Repair-Nginx) { Start-Sleep -Seconds 5; continue }
        Say '502 with nginx already on IPv4 -- app still starting' 'Yellow'
    } else {
        Say "http://localhost:$Port returned $code" 'Yellow'
    }
    Start-Sleep -Seconds $DelaySeconds
}

Say "Gave up after $MaxPasses passes. Diagnostics below." 'Red'
docker compose ps -a
Say '--- backend log' 'Cyan'
docker compose exec -T postiz pm2 logs backend --nostream --lines 25 2>&1
Say '--- temporal log' 'Cyan'
docker compose logs --tail 25 temporal 2>&1
exit 1
