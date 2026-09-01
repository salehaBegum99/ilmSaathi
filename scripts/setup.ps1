[CmdletBinding()]
param(
  [ValidateSet("Docker", "Native")]
  [string]$Mode = "Docker",
  [switch]$Start,
  [switch]$ForceEnvironment,
  [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
$RepositoryRoot = Split-Path -Parent $PSScriptRoot
$OriginalLocation = Get-Location

function Test-Tool {
  param([Parameter(Mandatory = $true)][string]$Name)
  return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Invoke-EnvironmentGenerator {
  param([switch]$Force)

  $GeneratorArguments = @("scripts/generate-env.mjs")
  if ($Force) {
    $GeneratorArguments += "--force"
  }

  if (Test-Tool "node") {
    & node @GeneratorArguments
    if ($LASTEXITCODE -ne 0) {
      throw "Environment generation failed."
    }
    return
  }

  if ($Mode -eq "Docker") {
    $Mount = "type=bind,source=$RepositoryRoot,target=/workspace"
    & docker run --rm --mount $Mount -w /workspace node:22-alpine node @GeneratorArguments
    if ($LASTEXITCODE -ne 0) {
      throw "Containerized environment generation failed."
    }
    return
  }

  throw "Node.js 22 is required for native setup."
}

try {
  Set-Location $RepositoryRoot
  Write-Host "IlmSaathi setup ($Mode mode)" -ForegroundColor Cyan

  if ($Mode -eq "Docker") {
    if (-not (Test-Tool "docker")) {
      throw "Docker Desktop with Compose v2 is required. Install it, start Docker Desktop, and retry."
    }

    & docker info *> $null
    if ($LASTEXITCODE -ne 0) {
      throw "Docker is installed but the engine is not running. Start Docker Desktop and retry."
    }

    & docker compose version
    if ($LASTEXITCODE -ne 0) {
      throw "Docker Compose v2 is required."
    }

    Invoke-EnvironmentGenerator -Force:$ForceEnvironment
    if (-not (Test-Path "package-lock.json")) {
      throw "package-lock.json is required. Generate and commit it before starting the stack."
    }
    & docker compose config --quiet
    if ($LASTEXITCODE -ne 0) {
      throw "compose.yaml or .env is invalid."
    }

    if ($Start) {
      & docker compose up --wait
      if ($LASTEXITCODE -ne 0) {
        throw "One or more containers failed to become healthy. Run: docker compose logs --tail=200"
      }
      Write-Host "IlmSaathi is ready at http://localhost:5173" -ForegroundColor Green
    } else {
      Write-Host "Setup is ready. Start with: docker compose up --build --wait" -ForegroundColor Green
    }
    return
  }

  if (-not (Test-Tool "node")) {
    throw "Node.js 22 is required for native setup."
  }
  if (-not (Test-Tool "npm")) {
    throw "npm 10 or newer is required for native setup."
  }

  $NodeMajor = [int](& node -p "process.versions.node.split('.')[0]")
  if ($NodeMajor -ne 22) {
    throw "This repository is pinned to Node.js 22. Found major version $NodeMajor."
  }

  Invoke-EnvironmentGenerator -Force:$ForceEnvironment

  if (-not (Test-Path "package-lock.json")) {
    throw "package-lock.json is required. Generate it with npm install, then retry."
  }

  if (-not $SkipInstall) {
    & npm ci
    if ($LASTEXITCODE -ne 0) {
      throw "Dependency installation failed."
    }
  }

  & node scripts/doctor.mjs --skip-network
  if ($LASTEXITCODE -ne 0) {
    throw "Environment checks failed."
  }

  if ($Start) {
    & node scripts/native-mongo.mjs start
    if ($LASTEXITCODE -ne 0) {
      throw "The project-owned MongoDB rs0 instance could not start."
    }

    & node scripts/doctor.mjs --strict
    if ($LASTEXITCODE -ne 0) {
      throw "Runtime checks failed. Resolve the reported database or environment issue and retry."
    }
    Write-Host "Starting web at http://localhost:5173 and API at http://localhost:4000" -ForegroundColor Yellow
    & npm run dev:native
  } else {
    Write-Host "Native setup is ready. Start everything with: npm run dev:native" -ForegroundColor Green
  }
}
finally {
  Set-Location $OriginalLocation
}
