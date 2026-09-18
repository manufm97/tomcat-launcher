# stop-app.ps1
# Parada generica de Tomcat para cualquier proyecto.
# Uso: .\scripts\stop-app.ps1 <nombre_proyecto>
# Ejemplo: .\scripts\stop-app.ps1 app_1

$ErrorActionPreference = "Stop"

function Resolve-ProjectDir {
    param(
        [string]$ScriptDir,
        [string]$ProjectName
    )

    $appsBase = [Environment]::GetEnvironmentVariable("APPS_BASE_PATH", "Process")
    if (-not $appsBase) { $appsBase = [Environment]::GetEnvironmentVariable("APPS_BASE_PATH", "User") }
    if (-not $appsBase) { $appsBase = [Environment]::GetEnvironmentVariable("APPS_BASE_PATH", "Machine") }
    if (-not $appsBase) { $appsBase = "C:\apps_env" }

    $candidates = @(
        (Join-Path $ScriptDir $ProjectName),
        (Join-Path (Join-Path $appsBase "resources") $ProjectName)
    )

    foreach ($candidate in ($candidates | Select-Object -Unique)) {
        if (Test-Path (Join-Path $candidate ".env")) {
            return $candidate
        }
    }

    return $candidates[0]
}

# --- Parametro: nombre del proyecto ---
$projectName = $args[0]
if (-not $projectName) {
    Write-Host "Uso: .\scripts\stop-app.ps1 <nombre_proyecto>" -ForegroundColor Cyan
    exit 1
}

# --- Directorios ---
$resourcesDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$projectDir = Resolve-ProjectDir -ScriptDir $resourcesDir -ProjectName $projectName

# --- Leer .env ---
$envFile = Join-Path $projectDir ".env"
if (-not (Test-Path $envFile)) {
    Write-Host "ERROR: No se encuentra .env en $projectDir" -ForegroundColor Red
    exit 1
}

Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith("#")) {
        $parts = $line -split "=", 2
        if ($parts.Length -eq 2) {
            $val = $parts[1].Trim().Trim('"').Trim("'")
            [Environment]::SetEnvironmentVariable($parts[0].Trim(), $val, "Process")
        }
    }
}

# --- Variables con defaults ---
if (-not $env:TOMCAT_SHUTDOWN_PORT) { [Environment]::SetEnvironmentVariable("TOMCAT_SHUTDOWN_PORT", 8005, "Process") }
if (-not $env:CONTEXT_PATH)        { [Environment]::SetEnvironmentVariable("CONTEXT_PATH", $projectName, "Process") }

# --- Intentar parada graceful via HTTP (CXF/Spring) ---
$tomcatPort = 8080
if (-not [int]::TryParse($env:TOMCAT_PORT, [ref]$tomcatPort)) { $tomcatPort = 8080 }
$ctx = $env:CONTEXT_PATH
if (-not $ctx) { $ctx = $projectName }

# --- Detener matando directamente el proceso Java del proyecto ---
# El puerto de shutdown (8005) no es fiable en este entorno: el proceso tarda en
# soltar los puertos y el script daba "detenido" sin estarlo. Se localiza por
# -Dtomcat.name=<proyecto> y se mata, esperando a que libere el puerto HTTP.
$pids = @()
Get-Process java -ErrorAction SilentlyContinue | ForEach-Object {
    try {
        $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)").CommandLine
        if ($cmd -and $cmd -match "-Dtomcat\.name=$([regex]::Escape($projectName))\b") {
            $pids += $_.Id
        }
    } catch {}
}

if ($pids.Count -eq 0) {
    Write-Host "No se encontro ningun proceso Tomcat activo para $projectName." -ForegroundColor Yellow
} else {
    foreach ($javaPid in $pids) {
        Write-Host "Deteniendo proceso Java (PID: $javaPid)..."
        try {
            Stop-Process -Id $javaPid -Force
            Write-Host "Proceso Java detenido (PID: $javaPid)." -ForegroundColor Green
        } catch {
            Write-Host "No se pudo detener el PID $javaPid : $($_.Exception.Message)" -ForegroundColor Red
        }
    }

    # --- Esperar a que libere el puerto HTTP (max ~30s) ---
    for ($i = 0; $i -lt 15; $i++) {
        if (-not (Get-NetTCPConnection -LocalPort $tomcatPort -State Listen -ErrorAction SilentlyContinue)) { break }
        Start-Sleep -Seconds 2
    }

    if (Get-NetTCPConnection -LocalPort $tomcatPort -State Listen -ErrorAction SilentlyContinue) {
        Write-Host "WARN: el puerto $tomcatPort sigue ocupado tras detener el proceso." -ForegroundColor Yellow
    } else {
        Write-Host "$projectName detenido correctamente (puerto $tomcatPort libre)." -ForegroundColor Green
    }
}

# --- Detener servicios Docker asociados al proyecto ---
$dockerComposeFile = $null

if ($env:START_DOCKER -ine "true") {
    Write-Host "START_DOCKER no activado: no se detienen servicios Docker" -ForegroundColor Yellow
} elseif ($env:DOCKER_COMPOSE_FILE) {
    if (Test-Path $env:DOCKER_COMPOSE_FILE) {
        $dockerComposeFile = $env:DOCKER_COMPOSE_FILE
    } else {
        Write-Host "WARN: DOCKER_COMPOSE_FILE no existe: $($env:DOCKER_COMPOSE_FILE)" -ForegroundColor Yellow
    }
} else {
    # Se busca en la carpeta del proyecto (resources\<proyecto>) y en PROJECT_DIR
    $dockerRoots = @($projectDir)
    if ($env:PROJECT_DIR) { $dockerRoots += $env:PROJECT_DIR }
    $composeNames = @("docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml")
    foreach ($root in ($dockerRoots | Select-Object -Unique)) {
        foreach ($sub in @("docker", "")) {
            foreach ($name in $composeNames) {
                $candidate = if ($sub) { Join-Path $root "$sub\$name" } else { Join-Path $root $name }
                if (Test-Path $candidate) { $dockerComposeFile = $candidate; break }
            }
            if ($dockerComposeFile) { break }
        }
        if ($dockerComposeFile) { break }
    }
}

if ($dockerComposeFile) {
    Write-Host ""
    Write-Host "Compose detectado: $dockerComposeFile" -ForegroundColor Cyan

    $dockerExe = Get-Command docker -ErrorAction SilentlyContinue
    if (-not $dockerExe) {
        Write-Host "WARN: hay compose pero Docker no esta en el PATH. Se omite." -ForegroundColor Yellow
    } else {
        & docker compose version 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Deteniendo servicios Docker..." -ForegroundColor Cyan
            & docker compose -f $dockerComposeFile stop
            $composeExit = $LASTEXITCODE
        } else {
            $composeExe = Get-Command docker-compose -ErrorAction SilentlyContinue
            if ($composeExe) {
                Write-Host "Deteniendo servicios Docker (docker-compose)..." -ForegroundColor Cyan
                & docker-compose -f $dockerComposeFile stop
                $composeExit = $LASTEXITCODE
            } else {
                Write-Host "WARN: Docker sin 'docker compose' ni 'docker-compose'. Se omite." -ForegroundColor Yellow
                $composeExit = -1
            }
        }

        if ($composeExit -eq 0) {
            Write-Host "Servicios Docker detenidos" -ForegroundColor Green
        } else {
            Write-Host "WARN: docker compose stop devolvio $composeExit" -ForegroundColor Yellow
        }
    }
}
