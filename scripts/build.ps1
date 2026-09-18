# build.ps1
# Build que soluciona EBUSY de CrowdStrike:
# 1. Build a un directorio temporal FUERA del proyecto
# 2. Robocopy /MIR sobreescribe archivos SIN borrar el directorio
# 3. Limpia el temporal

$ErrorActionPreference = "Stop"
$rootDir = Split-Path -Parent $PSScriptRoot
$finalDir = Join-Path $rootDir "dist\Tomcat Launcher-win32-x64"
$tempDir = Join-Path $env:TEMP "tomcat-launcher-build"

Write-Host "=== Build de Tomcat Launcher ===" -ForegroundColor Cyan

# Limpiar temporal previo
if (Test-Path $tempDir) {
    Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue
}

# Build a directorio temporal FUERA del proyecto
Write-Host "Empaquetando en directorio temporal..." -ForegroundColor Yellow
& (Join-Path $rootDir "node_modules\.bin\electron-packager.cmd") `
    $rootDir "Tomcat Launcher" `
    --platform=win32 --arch=x64 `
    --icon (Join-Path $rootDir "app.ico") `
    --out $tempDir `
    --overwrite `
    --ignore="node_modules" `
    --ignore="dist" `
    --ignore="clean-dist\.ps1"

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: electron-packager fallo." -ForegroundColor Red
    exit 1
}

$tempApp = Join-Path $tempDir "Tomcat Launcher-win32-x64"

# Sobreescribir usando robocopy (no necesita borrar el destino)
if (Test-Path $finalDir) {
    Write-Host "Sobreescribiendo build anterior con robocopy..." -ForegroundColor Yellow
    robocopy $tempApp $finalDir /MIR /NFL /NDL /NJH /NJS /NC /NS /NP
} else {
    Write-Host "Copiando build al directorio final..." -ForegroundColor Yellow
    Copy-Item -Path $tempApp -Destination $finalDir -Recurse -Force
}

# Limpiar temporal
Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "=== Build completado ===" -ForegroundColor Green
Write-Host "Salida: $finalDir" -ForegroundColor Cyan
