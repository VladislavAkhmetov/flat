[CmdletBinding()]
param(
    [switch]$PlanOnly
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$portsFile = Join-Path $projectRoot '.flat-local-ports.json'
$lockFile = Join-Path $projectRoot '.flat-local.lock'
$composeFile = Join-Path $projectRoot 'infra\docker-compose.yml'
$schemaFile = Join-Path $projectRoot 'apps\api-backend\prisma\schema.prisma'
$requirementsFile = Join-Path $projectRoot 'apps\ai-service\requirements.txt'
$venvPython = Join-Path $projectRoot '.venv\Scripts\python.exe'

Set-Location $projectRoot

function Write-Step([string]$Message) {
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Invoke-NativeQuiet([scriptblock]$Command) {
    # Windows PowerShell 5 turns any redirected native stderr output into an
    # ErrorRecord. With ErrorActionPreference=Stop, even harmless CLI warnings
    # would terminate the launcher, so quiet probes run with Continue locally.
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & $Command 2> $null | Out-Null
        return $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousPreference
    }
}

function Test-PortAvailable([int]$Port) {
    $activePorts = [System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners().Port
    if ($activePorts -contains $Port) {
        return $false
    }

    $listener = $null
    try {
        $listener = [System.Net.Sockets.TcpListener]::new(
            [System.Net.IPAddress]::Any,
            $Port
        )
        $listener.Server.ExclusiveAddressUse = $true
        $listener.Start()
        return $true
    }
    catch {
        return $false
    }
    finally {
        if ($null -ne $listener) {
            $listener.Stop()
        }
    }
}

$reservedPorts = [System.Collections.Generic.HashSet[int]]::new()

function Reserve-Port([int]$Preferred, [int]$FallbackStart) {
    $candidates = @($Preferred) + ($FallbackStart..($FallbackStart + 199))
    foreach ($candidate in $candidates) {
        if (-not $reservedPorts.Contains($candidate) -and (Test-PortAvailable $candidate)) {
            [void]$reservedPorts.Add($candidate)
            return $candidate
        }
    }
    throw "No free port found near $FallbackStart."
}

function Read-SavedPorts {
    if (-not (Test-Path -LiteralPath $portsFile)) {
        return $null
    }

    try {
        return Get-Content -LiteralPath $portsFile -Raw | ConvertFrom-Json
    }
    catch {
        Write-Warning 'Saved port configuration is invalid; choosing ports again.'
        return $null
    }
}

function Show-Addresses($SelectedPorts) {
    Write-Host ''
    Write-Host 'Flat Builder local addresses' -ForegroundColor Green
    Write-Host "  3D      : http://localhost:$($SelectedPorts.widget)"
    Write-Host "  API     : http://localhost:$($SelectedPorts.api)"
    Write-Host "  AI      : http://localhost:$($SelectedPorts.ai)"
    Write-Host "  Postgres: localhost:$($SelectedPorts.postgres)"
}

function Read-DotEnv([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) {
        return
    }

    foreach ($line in Get-Content -LiteralPath $Path) {
        if ($line -notmatch '^\s*([^#][^=]*)=(.*)$') {
            continue
        }

        $name = $Matches[1].Trim()
        $value = $Matches[2].Trim()
        if (($value.StartsWith('"') -and $value.EndsWith('"')) -or
            ($value.StartsWith("'") -and $value.EndsWith("'"))) {
            $value = $value.Substring(1, $value.Length - 2)
        }

        if ([string]::IsNullOrEmpty([Environment]::GetEnvironmentVariable($name, 'Process'))) {
            [Environment]::SetEnvironmentVariable($name, $value, 'Process')
        }
    }
}

function Find-Python {
    $candidates = @(
        @{ Command = 'py'; Arguments = @('-3.12') },
        @{ Command = 'py'; Arguments = @('-3.11') },
        @{ Command = 'python'; Arguments = @() }
    )

    foreach ($candidate in $candidates) {
        if (-not (Get-Command $candidate.Command -ErrorAction SilentlyContinue)) {
            continue
        }

        try {
            $pythonExitCode = Invoke-NativeQuiet {
                & $candidate.Command @($candidate.Arguments) -c 'import sys; print(sys.executable)'
            }
            if ($pythonExitCode -eq 0) {
                return $candidate
            }
        }
        catch {
            continue
        }
    }

    return $null
}

function Ensure-Docker {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw 'Docker Desktop is required but the docker command was not found.'
    }

    if ((Invoke-NativeQuiet { docker info }) -eq 0) {
        return
    }

    $dockerDesktop = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
    if (-not (Test-Path -LiteralPath $dockerDesktop)) {
        throw 'Docker Desktop is required but was not found.'
    }

    Write-Step 'Starting Docker Desktop'
    Start-Process -FilePath $dockerDesktop | Out-Null
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        Start-Sleep -Seconds 2
        if ((Invoke-NativeQuiet { docker info }) -eq 0) {
            return
        }
    }

    throw 'Docker Desktop did not become ready within two minutes.'
}

function Wait-ForPostgres {
    for ($attempt = 0; $attempt -lt 45; $attempt++) {
        $postgresExitCode = Invoke-NativeQuiet {
            docker compose -p flat-local -f $composeFile exec -T postgres pg_isready -U flat_user -d flat_db
        }
        if ($postgresExitCode -eq 0) {
            return
        }
        Start-Sleep -Seconds 1
    }

    throw 'PostgreSQL did not become ready.'
}

if (-not $PlanOnly -and (Test-Path -LiteralPath $lockFile)) {
    $existingPid = 0
    $lockText = (Get-Content -LiteralPath $lockFile -Raw).Trim()
    if ([int]::TryParse($lockText, [ref]$existingPid) -and
        (Get-Process -Id $existingPid -ErrorAction SilentlyContinue)) {
        Write-Host "`nFlat Builder is already running (PID $existingPid)." -ForegroundColor Yellow
        $runningPorts = Read-SavedPorts
        if ($null -ne $runningPorts) {
            Show-Addresses $runningPorts
            try {
                Start-Process "http://localhost:$($runningPorts.widget)"
            }
            catch {
                Write-Warning 'Could not open the 3D widget automatically.'
            }
        }
        Write-Host 'Use the original launcher window to view logs or stop the project.'
        exit 0
    }
}

# A database container can survive Ctrl+C from the previous run. Stop only this
# project's container before checking ports so its saved port can be reused.
if (-not $PlanOnly -and (Get-Command docker -ErrorAction SilentlyContinue)) {
    if ((Invoke-NativeQuiet { docker info }) -eq 0) {
        [void](Invoke-NativeQuiet {
            docker compose -p flat-local -f $composeFile stop postgres
        })
    }
}

$saved = Read-SavedPorts
$apiPreferred = if ($null -ne $saved -and $saved.api) { [int]$saved.api } else { 3000 }
$aiPreferred = if ($null -ne $saved -and $saved.ai) { [int]$saved.ai } else { 5000 }
$widgetPreferred = if ($null -ne $saved -and $saved.widget) { [int]$saved.widget } else { 5173 }
$postgresPreferred = if ($null -ne $saved -and $saved.postgres) { [int]$saved.postgres } else { 5432 }

$ports = [ordered]@{
    api = Reserve-Port $apiPreferred 3100
    ai = Reserve-Port $aiPreferred 5100
    widget = Reserve-Port $widgetPreferred 5273
    postgres = Reserve-Port $postgresPreferred 55432
}

Show-Addresses $ports

if ($PlanOnly) {
    Write-Host "`nPlan only: no services were started." -ForegroundColor Yellow
    exit 0
}

Set-Content -LiteralPath $lockFile -Value $PID -Encoding ascii
$ports | ConvertTo-Json | Set-Content -LiteralPath $portsFile -Encoding utf8

$launcherExitCode = 0
try {
    Read-DotEnv (Join-Path $projectRoot '.env')

    $env:FLAT_API_PORT = [string]$ports.api
    $env:FLAT_AI_PORT = [string]$ports.ai
    $env:FLAT_WIDGET_PORT = [string]$ports.widget
    $env:FLAT_POSTGRES_PORT = [string]$ports.postgres
    $env:FLAT_API_ORIGIN = "http://127.0.0.1:$($ports.api)"
    $env:PUBLIC_URL = "http://localhost:$($ports.api)"
    $env:VITE_API_URL = "http://localhost:$($ports.api)/api"
    $env:VITE_AI_URL = "http://localhost:$($ports.ai)"
    $env:VITE_WIDGET_URL = "http://localhost:$($ports.widget)"
    $env:DATABASE_URL = "postgresql://flat_user:flat_password@localhost:$($ports.postgres)/flat_db?schema=public"

    if (-not (Get-Command node -ErrorAction SilentlyContinue) -or
        -not (Get-Command npm -ErrorAction SilentlyContinue)) {
        throw 'Node.js and npm are required.'
    }

    if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules\.bin\concurrently.cmd'))) {
        Write-Step 'Installing Node.js dependencies'
        & npm.cmd install
        if ($LASTEXITCODE -ne 0) {
            throw 'npm install failed.'
        }
    }

    if (-not (Test-Path -LiteralPath $venvPython)) {
        $python = Find-Python
        if ($null -eq $python) {
            throw 'Python 3.11 or 3.12 is required. Install it, then run start-local.bat again.'
        }

        Write-Step 'Creating the local Python environment'
        & $python.Command @($python.Arguments) -m venv (Join-Path $projectRoot '.venv')
        if ($LASTEXITCODE -ne 0) {
            throw 'Could not create the Python virtual environment.'
        }
    }

    $aiImportsExitCode = Invoke-NativeQuiet {
        & $venvPython -c 'import fastapi, uvicorn, cv2, numpy, PIL, torch, torchvision, ultralytics, transformers, easyocr'
    }
    if ($aiImportsExitCode -ne 0) {
        Write-Step 'Installing AI service dependencies (first run can take a while)'
        & $venvPython -m pip install --upgrade pip
        if ($LASTEXITCODE -ne 0) {
            throw 'Could not update pip.'
        }
        & $venvPython -m pip install -r $requirementsFile
        if ($LASTEXITCODE -ne 0) {
            throw 'Could not install AI service dependencies.'
        }
    }

    Ensure-Docker
    Write-Step 'Starting PostgreSQL'
    & docker compose -p flat-local -f $composeFile up -d postgres
    if ($LASTEXITCODE -ne 0) {
        throw 'Could not start PostgreSQL.'
    }
    Wait-ForPostgres

    Write-Step 'Preparing the database'
    $prisma = Join-Path $projectRoot 'node_modules\.bin\prisma.cmd'
    & $prisma generate --schema=$schemaFile
    if ($LASTEXITCODE -ne 0) {
        throw 'Prisma client generation failed.'
    }
    & $prisma db push --skip-generate --schema=$schemaFile
    if ($LASTEXITCODE -ne 0) {
        throw 'Database schema synchronization failed.'
    }

    Write-Step 'Starting all services (Ctrl+C stops the application services)'
    $concurrently = Join-Path $projectRoot 'node_modules\.bin\concurrently.cmd'
    & $concurrently `
        --kill-others-on-fail `
        --names API,AI,WIDGET `
        --prefix-colors blue,magenta,green `
        'npm run dev -w apps/api-backend' `
        "`"$venvPython`" -u apps/ai-service/server.py" `
        'npm run dev -w apps/widget-frontend'

    $launcherExitCode = $LASTEXITCODE
}
catch {
    Write-Host "`nERROR: $($_.Exception.Message)" -ForegroundColor Red
    $launcherExitCode = 1
}
finally {
    Remove-Item -LiteralPath $lockFile -Force -ErrorAction SilentlyContinue
}

exit $launcherExitCode
