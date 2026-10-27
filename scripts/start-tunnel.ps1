[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$venvPython = Join-Path $projectRoot '.venv\Scripts\python.exe'
$cloudflared = Join-Path $projectRoot 'scripts\bin\cloudflared.exe'
$tunnelScript = Join-Path $projectRoot 'scripts\tunnel.py'

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   Starting Flat Builder Tunnels for Figma Code..." -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Start AI service if not already on port 5000
$port5000InUse = [System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners().Port -contains 5000
if (-not $port5000InUse) {
    Write-Host "[AI] Starting Python AI service on port 5000..." -ForegroundColor Yellow
    Start-Process -FilePath $venvPython -ArgumentList "apps/ai-service/server.py" -WorkingDirectory $projectRoot -WindowStyle Hidden
} else {
    Write-Host "[AI] Port 5000 already in use (AI service running)." -ForegroundColor Green
}

# 2. Start API Backend on port 3100 if not already in use
$port3100InUse = [System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners().Port -contains 3100
if (-not $port3100InUse) {
    Write-Host "[API] Starting Fastify backend on port 3100..." -ForegroundColor Yellow
    $env:PORT = "3100"
    $env:FLAT_API_PORT = "3100"
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm run dev -w apps/api-backend" -WorkingDirectory $projectRoot -WindowStyle Hidden
} else {
    Write-Host "[API] Port 3100 already in use (API backend running)." -ForegroundColor Green
}

# 3. Run tunnel orchestrator
Write-Host "`nEstablishing Cloudflare HTTPS tunnels..." -ForegroundColor Cyan
& $venvPython $tunnelScript
