# start-app.ps1
# Arranque generico de Tomcat para cualquier proyecto.
# Replica SmartTomcat: CATALINA_BASE aislado por proyecto.
# Uso: .\scripts\start-app.ps1 <nombre_proyecto>
# Ejemplo: .\scripts\start-app.ps1 app_1

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
# Parametros opcionales de depuracion (JDWP): puerto y suspend (y/n).
# Se reciben como argumentos (no como variables de entorno) para que el build
# de Maven/Node NO los herede y se comporte igual que un arranque normal.
$debugPort = $args[1]
$debugSuspend = $args[2]
# Limpiar de entorno por si acaso, para no influir en la compilacion.
Remove-Item "Env:DEBUG_PORT" -ErrorAction SilentlyContinue
Remove-Item "Env:DEBUG_SUSPEND" -ErrorAction SilentlyContinue
if (-not $projectName) {
    Write-Host "Uso: .\scripts\start-app.ps1 <nombre_proyecto> [puerto_debug] [suspend=y/n]" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Proyectos disponibles:"
    Get-ChildItem -Path (Split-Path -Parent $MyInvocation.MyCommand.Definition) -Directory |
        Where-Object { Test-Path (Join-Path $_.FullName ".env") } |
        ForEach-Object { Write-Host "  - $($_.Name)" }
    exit 1
}

# --- Limpiar variables de ejecuciones anteriores en esta misma consola ---
# SetEnvironmentVariable("Process") persiste en la sesion aunque el script termine;
# sin esta limpieza un proyecto heredaria variables del proyecto anterior.
$varsToClear = @(
    "PROJECT_NAME", "APP_CODE", "ARTIFACT_TYPE", "ARTIFACT_NAME", "WAR_MODULE_DIR",
    "PROJECT_DIR", "PROJECT_DIR_FRONTEND", "WAR_DIR", "CONTEXT_PATH", "APPS_ENV", "APPS_BASE_PATH",
    "APPS_CONFIG_PATH", "APPS_LOG_PATH", "APPS_CERT_PATH", "APPS_DATA_PATH",
    "APPS_TEMP_PATH", "APPS_RESOURCE_PATH", "APP_SERVER", "TOMCAT_VERSION",
    "SERVER_HOME", "TOMCAT_HOME", "TOMCAT_PORT", "TOMCAT_SHUTDOWN_PORT", "DEBUG_PORT",
    "JAVA_VERSION", "JAVA_HOME", "MVN_CMD", "MAVEN_OPTS_EXTRA", "MAVEN_HOME",
    "HEALTH_CHECK_URL", "HEALTH_CHECK_MAX_ATTEMPTS", "HEALTH_CHECK_INTERVAL",
    "JNDI_NAME", "JNDI_DRIVER", "JNDI_VALIDATION_QUERY", "JNDI_MAX_IDLE", "JNDI_MAX_TOTAL",
    "DB_URL_PROPERTY", "DB_USERNAME_PROPERTY", "DB_PASSWORD_PROPERTY",
    "DB_URL_REGVAR", "DB_USERNAME_REGVAR", "DB_PASSWORD_REGVAR",
    "DB_URL", "DB_USERNAME", "DB_PASSWORD",
    "SKIP_BUILD", "START_DOCKER", "DOCKER_COMPOSE_FILE", "DOCKER_WAIT_PORT",
    "DOCKER_HEALTH_URL", "DOCKER_WAIT_TIMEOUT",
    "EXTRA_JVM_ARGS", "JVM_XMS", "JVM_XMX", "JVM_MAX_METASPACE",
    "JAVAX_NET_SSL_TRUSTSTORE", "JAVAX_NET_SSL_TRUSTSTORE_PASSWORD",
    "CATALINA_HOME", "CATALINA_BASE", "CATALINA_TMPDIR"
)
foreach ($v in $varsToClear) {
    Remove-Item "Env:$v" -ErrorAction SilentlyContinue
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

Write-Host "Proyecto: $projectName"
Write-Host "Leyendo configuracion de .env..."
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

# --- Importar credenciales de BD del registro ---
Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith("#")) {
        $parts = $line -split "=", 2
        if ($parts.Length -eq 2) {
            $key = $parts[0].Trim()
            $val = $parts[1].Trim()
            if ($key -match "_REGVAR$") {
                $regValue = Get-ItemProperty -Path "HKCU:\Environment" -Name $val -ErrorAction SilentlyContinue
                if ($regValue) {
                    $propKey = $key -replace "_REGVAR$", ""
                    [Environment]::SetEnvironmentVariable($propKey, $regValue.($val), "Process")
                }
            }
        }
    }
}

# --- Defaults ---
$defaults = @{
    "TOMCAT_PORT"          = "8080"
    "TOMCAT_SHUTDOWN_PORT" = "8005"
    "APPS_BASE_PATH"       = "C:\apps_env"
    "JVM_XMS"              = "512m"
    "JVM_XMX"              = "1024m"
    "JVM_MAX_METASPACE"    = "256m"
}
foreach ($entry in $defaults.GetEnumerator()) {
    if (-not [Environment]::GetEnvironmentVariable($entry.Key, "Process")) {
        [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, "Process")
    }
}

# --- Derivar rutas estandar a partir de APPS_BASE_PATH (evita repetirlas en los .env) ---
# APPS_CERT_PATH va sin sufijo de proyecto: el framework añade el
# codigo de aplicacion el solo (<cert>\<applicationCode>\<applicationCode>.semilla)
$appsBase = [Environment]::GetEnvironmentVariable("APPS_BASE_PATH", "Process").TrimEnd('\')
foreach ($pair in @(
        @{ K = "APPS_CONFIG_PATH";   V = "$appsBase\config" },
        @{ K = "APPS_LOG_PATH";      V = "$appsBase\logs" },
        @{ K = "APPS_DATA_PATH";     V = "$appsBase\data" },
        @{ K = "APPS_TEMP_PATH";     V = "$appsBase\temp" },
        @{ K = "APPS_RESOURCE_PATH"; V = "$appsBase\resources" },
        @{ K = "APPS_CERT_PATH";     V = "$appsBase\cert" })) {
    if (-not [Environment]::GetEnvironmentVariable($pair.K, "Process")) {
        [Environment]::SetEnvironmentVariable($pair.K, $pair.V, "Process")
    }
}

# --- Normalizar entorno de despliegue (debe ser un nombre de carpeta: local, dev, stg...) ---
if (-not ($env:APPS_ENV -match "^[a-zA-Z0-9_-]+$")) {
    Write-Host "WARN: APPS_ENV='$($env:APPS_ENV)' no es valido. Se usa 'local'." -ForegroundColor Yellow
    [Environment]::SetEnvironmentVariable("APPS_ENV", "local", "Process")
}

# --- Validaciones ---
foreach ($var in @("TOMCAT_HOME", "JAVA_HOME", "CONTEXT_PATH")) {
    if (-not [Environment]::GetEnvironmentVariable($var, "Process")) {
        Write-Host "ERROR: Falta $var en el .env" -ForegroundColor Red
        exit 1
    }
}

$bootstrapJar = Join-Path $env:TOMCAT_HOME "bin\bootstrap.jar"
if (-not (Test-Path $bootstrapJar)) {
    Write-Host "ERROR: Tomcat no encontrado en: $($env:TOMCAT_HOME)" -ForegroundColor Red
    exit 1
}

# --- Parar Tomcat si ya estaba arrancado (reinicio idempotente) ---
try {
    $tcp = New-Object System.Net.Sockets.TcpClient("127.0.0.1", [int]$env:TOMCAT_SHUTDOWN_PORT)
    $stream = $tcp.GetStream()
    $writer = New-Object System.IO.StreamWriter($stream)
    $writer.Write("SHUTDOWN")
    $writer.Flush()
    $stream.Close()
    $tcp.Close()
    Write-Host "Tomcat estaba arrancado: enviando SHUTDOWN..."

    # Esperar activamente a que suelte los puertos (max ~40s)
    $portsToFree = @([int]$env:TOMCAT_SHUTDOWN_PORT, [int]$env:TOMCAT_PORT)
    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Seconds 2
        $busy = $false
        foreach ($p in $portsToFree) {
            if (Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue) {
                $busy = $true
                break
            }
        }
        if (-not $busy) { break }
    }

    # Margen extra para que el proceso libere los ficheros abiertos
    Start-Sleep -Seconds 3
    Write-Host "Tomcat parado."
} catch {}

# --- Compilar proyecto (siempre, salvo SKIP_BUILD=true en el .env) ---
if ($env:SKIP_BUILD -ieq "true") {
    Write-Host "SKIP_BUILD=true: se omite la compilacion Maven"
} elseif ($env:PROJECT_DIR) {
    Write-Host "Compilando proyecto..." -ForegroundColor Cyan

    $mvnGoals = @("install", "-DskipTests")
    if ($env:APPS_ENV) { $mvnGoals += "-Dapps_env=$($env:APPS_ENV)" }

    $mvnExe = $null
    $useWrapper = $false

    $mvnWrapper = Join-Path $env:PROJECT_DIR "mvnw.cmd"
    $mvnWrapperProps = Join-Path $env:PROJECT_DIR ".mvn\wrapper\maven-wrapper.properties"
    if ((Test-Path $mvnWrapper) -and (Test-Path $mvnWrapperProps)) {
        $mvnExe = $mvnWrapper
        $useWrapper = $true
    } else {
        $mvnCmd = Get-Command mvn -ErrorAction SilentlyContinue
        if ($mvnCmd) {
            $mvnExe = $mvnCmd.Source
        } elseif ($env:MAVEN_HOME -and (Test-Path "$env:MAVEN_HOME\bin\mvn.cmd")) {
            $mvnExe = "$env:MAVEN_HOME\bin\mvn.cmd"
        } elseif (Test-Path "C:\maven\apache-maven-3.6.3\bin\mvn.cmd") {
            $mvnExe = "C:\maven\apache-maven-3.6.3\bin\mvn.cmd"
        }
    }

    if ($mvnExe) {
        Write-Host "  Maven: $mvnExe"
        Write-Host "  Directorio: $($env:PROJECT_DIR)"

        # --- Fase 1: Validar compilacion (mvn compile) ---
        Write-Host "Validando compilacion..." -ForegroundColor Cyan
        if ($useWrapper) {
            & cmd.exe /c "cd /d `"$($env:PROJECT_DIR)`" && `"$mvnExe`" compile -q"
        } else {
            Push-Location $env:PROJECT_DIR
            try {
                & $mvnExe compile -q
            } finally {
                Pop-Location
            }
        }
        if ($LASTEXITCODE -ne 0) {
            Write-Host "ERROR: Fallo la compilacion. Revisa el codigo fuente." -ForegroundColor Red
            exit 1
        }
        Write-Host "Compilacion validada OK" -ForegroundColor Green

        # --- Fase 2: Build completo (mvn install -DskipTests) ---
        if ($useWrapper) {
            & cmd.exe /c "cd /d `"$($env:PROJECT_DIR)`" && `"$mvnExe`" $($mvnGoals -join ' ')"
        } else {
            Push-Location $env:PROJECT_DIR
            try {
                & $mvnExe $mvnGoals
            } finally {
                Pop-Location
            }
        }
        if ($LASTEXITCODE -ne 0) {
            Write-Host "ERROR: Fallo la compilacion" -ForegroundColor Red
            exit 1
        }
        Write-Host "Compilacion OK" -ForegroundColor Green
    } else {
        Write-Host "ERROR: No se encontro Maven (ni mvnw ni mvn en PATH)" -ForegroundColor Red
        exit 1
    }
}

# --- Copiar configuracion externa (modulos <proyecto>-config y -resources) ---
foreach ($pair in @(
        @{ Module = "$projectName-config";    Dest = $env:APPS_CONFIG_PATH },
        @{ Module = "$projectName-resources"; Dest = $env:APPS_RESOURCE_PATH })) {
    if (-not $pair.Dest) { continue }
    $configCandidates = @(
        (Join-Path $env:PROJECT_DIR "$($pair.Module)\src\main\resources\$($env:APPS_ENV)"),
        (Join-Path $env:PROJECT_DIR "$($pair.Module)\main\resources\$($env:APPS_ENV)")
    )
    $configSrc = $configCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
    if ($configSrc) {
        $destDir = Join-Path $pair.Dest $projectName
        New-Item -ItemType Directory -Path $destDir -Force | Out-Null
        $skipped = @()
        Get-ChildItem -Path $configSrc -File -Recurse | ForEach-Object {
            $rel = $_.FullName.Substring($configSrc.Length).TrimStart("\")
            $destFile = Join-Path $destDir $rel
            $destSub = Split-Path $destFile -Parent
            if (-not (Test-Path $destSub)) {
                New-Item -ItemType Directory -Path $destSub -Force | Out-Null
            }
            try {
                Copy-Item -LiteralPath $_.FullName -Destination $destFile -Force
            } catch {
                $skipped += $rel
            }
        }
        if ($skipped.Count -gt 0) {
            Write-Host "WARN: ficheros bloqueados por otro proceso (no se actualizan):" -ForegroundColor Yellow
            $skipped | ForEach-Object { Write-Host "  - $_" }
            foreach ($jp in (Get-Process java -ErrorAction SilentlyContinue)) {
                $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=$($jp.Id)" -ErrorAction SilentlyContinue).CommandLine
                if ($cmd -and $cmd -match [regex]::Escape($projectName)) {
                    Write-Host "  Posible responsable -> PID $($jp.Id)" -ForegroundColor Yellow
                }
            }
        } else {
            Write-Host "Config copiada: $configSrc -> $destDir"
        }
    } else {
        Write-Host "Sin configuracion en $($pair.Module) para el entorno '$($env:APPS_ENV)' (se omite)"
    }
}

# --- Adaptar nombres JNDI estilo JBoss al contexto Tomcat ---
# Los .properties del repo traen 'java:jboss/datasources/X' (o 'jdbc/X' pelado);
# en Tomcat el DataSource se publica en 'java:comp/env/jdbc/X'.
$cfgDest = Join-Path $env:APPS_CONFIG_PATH $projectName
if (Test-Path $cfgDest) {
    Get-ChildItem -Path $cfgDest -Filter "*.properties" -File | ForEach-Object {
        $latin1 = [System.Text.Encoding]::GetEncoding(28591)
        $raw = $latin1.GetString([System.IO.File]::ReadAllBytes($_.FullName))
        $fixed = $raw -replace "(?m)^(jdbc\.jndi\.name=)java:jboss/datasources/", '${1}java:comp/env/jdbc/'
        $fixed = $fixed -replace "(?m)^(jdbc\.jndi\.name=)jdbc/", '${1}java:comp/env/jdbc/'
        if ($fixed -ne $raw) {
            [System.IO.File]::WriteAllText($_.FullName, $fixed, $latin1)
            Write-Host "JNDI adaptado a Tomcat en: $($_.Name)"
        }
    }
}

# --- Crear directorios de datos/logs/temp/cert ---
foreach ($dir in @($env:APPS_DATA_PATH, $env:APPS_TEMP_PATH, $env:APPS_LOG_PATH, $env:APPS_CERT_PATH)) {
    if ($dir -and -not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
}

# --- ENCRYPT_KEY: si no esta en el .env, intentar leerlo del certificado ---
# Algunos proyectos lo tienen en C:\apps_env\cert\<proyecto>\*_encrypt_key.yml
if (-not [Environment]::GetEnvironmentVariable("ENCRYPT_KEY", "Process")) {
    $certBase = [Environment]::GetEnvironmentVariable("APPS_CERT_PATH", "Process")
    if (-not $certBase) { $certBase = Join-Path ([Environment]::GetEnvironmentVariable("APPS_BASE_PATH", "Process")) "cert" }
    $certProjectDir = Join-Path $certBase $projectName
    $keyFile = Get-ChildItem -Path $certProjectDir -Filter "*_encrypt_key.yml" -File -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($keyFile) {
        $keyLine = Get-Content $keyFile.FullName | Where-Object { $_ -match '^\s*key:\s*(.+?)\s*$' } | Select-Object -First 1
        if ($keyLine) {
            $keyVal = ($keyLine -replace '^\s*key:\s*', '').Trim()
            [Environment]::SetEnvironmentVariable("ENCRYPT_KEY", $keyVal, "Process")
            Write-Host "ENCRYPT_KEY cargado desde $($keyFile.FullName)"
        }
    }
}

# ============================================================
# Servicios Docker auxiliares (config server, colas, ...)
# Algunas apps no funcionan sin su config server en
# Docker. Solo se levantan cuando START_DOCKER=true. Si no se indica ruta se
# detecta automaticamente la carpeta docker/ (o un compose en la raiz).
# ============================================================
$dockerSummary = "sin compose"
$dockerComposeFile = $null

if ($env:START_DOCKER -ine "true") {
    Write-Host "START_DOCKER no activado: no se arrancan servicios Docker"
    $dockerSummary = "no activado"
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

    # El compose puede interpolar variables del .env (p.ej. ENCRYPT_KEY), que ya
    # estan en el entorno del proceso y las hereda docker.
    $dockerExe = Get-Command docker -ErrorAction SilentlyContinue
    if (-not $dockerExe) {
        Write-Host "WARN: hay compose pero Docker no esta en el PATH. Se arranca Tomcat sin estos servicios." -ForegroundColor Yellow
        $dockerSummary = "Docker no disponible"
    } else {
        # --- Verificar si el daemon Docker esta respondiendo ---
        $dockerReady = $false
        try {
            & docker info 2>&1 | Out-Null
            $dockerReady = $LASTEXITCODE -eq 0
        } catch {
            $dockerReady = $false
        }

        if (-not $dockerReady) {
            Write-Host "Daemon Docker no responde. Intentando arrancar Docker Desktop..." -ForegroundColor Yellow

            $dockerDesktopPaths = @(
                "C:\Program Files\Docker\Docker\Docker Desktop.exe",
                "$env:LOCALAPPDATA\Docker\Docker\Docker Desktop.exe"
            )
            $dockerExePath = $dockerDesktopPaths | Where-Object { Test-Path $_ } | Select-Object -First 1

            if ($dockerExePath) {
                Start-Process -FilePath $dockerExePath -WindowStyle Minimized
                $dockerStartupTimeout = 120
                $dockerDeadline = (Get-Date).AddSeconds($dockerStartupTimeout)
                Write-Host "Esperando a que Docker Desktop arranque (hasta ${dockerStartupTimeout}s)..."
                while ((Get-Date) -lt $dockerDeadline) {
                    Start-Sleep -Seconds 5
                    try {
                        & docker info 2>&1 | Out-Null
                        if ($LASTEXITCODE -eq 0) { $dockerReady = $true; break }
                    } catch {}
                }
                if ($dockerReady) {
                    Write-Host "Docker Desktop arrancado" -ForegroundColor Green
                } else {
                    Write-Host "WARN: Docker Desktop no responde tras ${dockerStartupTimeout}s. Se continua sin Docker." -ForegroundColor Yellow
                }
            } else {
                Write-Host "WARN: Docker Desktop no encontrado. Se continua sin Docker." -ForegroundColor Yellow
            }
        }

        if (-not $dockerReady) {
            $dockerSummary = "Docker no disponible"
        } else {
            & docker compose version 2>&1 | Out-Null
            if ($LASTEXITCODE -eq 0) {
                & docker compose -f $dockerComposeFile up -d
                $composeExit = $LASTEXITCODE
            } else {
                $composeExe = Get-Command docker-compose -ErrorAction SilentlyContinue
                if ($composeExe) {
                    & docker-compose -f $dockerComposeFile up -d
                    $composeExit = $LASTEXITCODE
                } else {
                    Write-Host "WARN: Docker sin 'docker compose' ni 'docker-compose'. Se arranca Tomcat sin estos servicios." -ForegroundColor Yellow
                    $dockerSummary = "compose no disponible"
                    $composeExit = -1
                }
            }

            if ($composeExit -ne 0) {
                Write-Host "WARN: docker compose devolvio $composeExit. La app puede fallar si depende de estos servicios." -ForegroundColor Yellow
                if ($dockerSummary -eq "sin compose") { $dockerSummary = "error al arrancar" }
            } else {
                Write-Host "Servicios Docker arrancados" -ForegroundColor Green
                $dockerSummary = "arrancado"
            }

            # --- Esperar a que los servicios respondan (opcional) ---
            $dockerWaitPort = 0
            if ($env:DOCKER_WAIT_PORT) { [int]::TryParse($env:DOCKER_WAIT_PORT, [ref]$dockerWaitPort) | Out-Null }
            $dockerTimeout = if ($env:DOCKER_WAIT_TIMEOUT) { [int]$env:DOCKER_WAIT_TIMEOUT } else { 90 }

            if ($composeExit -eq 0 -and ($dockerWaitPort -gt 0 -or $env:DOCKER_HEALTH_URL)) {
                Write-Host "Esperando servicios Docker (hasta $dockerTimeout s)..."
                $dockerDeadline = (Get-Date).AddSeconds($dockerTimeout)
                $dockerUp = $false
                while ((Get-Date) -lt $dockerDeadline) {
                    $portOk = $true
                    if ($dockerWaitPort -gt 0) {
                        $portOk = $null -ne (Get-NetTCPConnection -LocalPort $dockerWaitPort -State Listen -ErrorAction SilentlyContinue)
                    }
                    $urlOk = $true
                    if ($env:DOCKER_HEALTH_URL) {
                        $urlOk = $false
                        try {
                            $dresp = Invoke-WebRequest -Uri $env:DOCKER_HEALTH_URL -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
                            $urlOk = ([int]$dresp.StatusCode -eq 200)
                        } catch {
                            $urlOk = $false
                        }
                    }
                    if ($portOk -and $urlOk) { $dockerUp = $true; break }
                    Start-Sleep -Seconds 2
                }
                if ($dockerUp) {
                    Write-Host "Servicios Docker listos" -ForegroundColor Green
                    $dockerSummary = "listo"
                } else {
                    Write-Host "WARN: los servicios Docker no responden tras $dockerTimeout s." -ForegroundColor Yellow
                    $dockerSummary = "sin respuesta"
                }
            }
        }
    }
}

# ============================================================
# Base Tomcat propia por proyecto (estilo Eclipse Servers)
# <TOMCAT_HOME>\<proyecto>\ con conf/, webapps/, logs/, temp/ y
# work/ aislados: cada app se depura sin mezclarse con las demas.
# Todas escuchan en TOMCAT_PORT (8080), una arrancada cada vez.
# ============================================================
$catHome = $env:TOMCAT_HOME
$catBase = if ($env:CATALINA_BASE) { $env:CATALINA_BASE } else { Join-Path $catHome $projectName }
$catConf = Join-Path $catBase "conf"
$catWebapps = Join-Path $catBase "webapps"
$catTemp = Join-Path $catBase "temp"
$catLogs = Join-Path $catBase "logs"
$contextDir = Join-Path $catConf "Catalina\localhost"

Write-Host "Base del proyecto: $catBase"

# --- Crear estructura de la base ---
foreach ($dir in @($catWebapps, $catTemp, $catLogs, (Join-Path $catBase "work"), $contextDir)) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
}

# --- Inicializar conf/ de la base copiandolo de la instalacion ---
$homeConf = Join-Path $catHome "conf"
if (-not (Test-Path (Join-Path $catConf "server.xml"))) {
    Write-Host "Inicializando conf/ de la base desde $homeConf"
    Get-ChildItem -Path $homeConf -File | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination $catConf -Force
    }
}

# --- Configurar puertos en el server.xml de la base ---
$serverXml = Join-Path $catConf "server.xml"
if (Test-Path $serverXml) {
    [xml]$xml = Get-Content $serverXml

    # Puerto de shutdown: habilitarlo si esta desactivado (port="-1")
    $serverEl = $xml.SelectSingleNode("//Server")
    if ($serverEl -and $env:TOMCAT_SHUTDOWN_PORT -and $serverEl.GetAttribute("port") -ne $env:TOMCAT_SHUTDOWN_PORT) {
        Write-Host "Puerto shutdown: $($serverEl.GetAttribute('port')) -> $($env:TOMCAT_SHUTDOWN_PORT)"
        $serverEl.SetAttribute("port", $env:TOMCAT_SHUTDOWN_PORT)
    }

    # Puerto HTTP
    if ($env:TOMCAT_PORT) {
        $connectors = $xml.SelectNodes("//Connector[@protocol='HTTP/1.1']")
        foreach ($connectorEl in $connectors) {
            if ($connectorEl.GetAttribute("port") -ne $env:TOMCAT_PORT) {
                Write-Host "Puerto HTTP: $($connectorEl.GetAttribute('port')) -> $($env:TOMCAT_PORT)"
                $connectorEl.SetAttribute("port", $env:TOMCAT_PORT)
            }
        }
    }

    $xml.Save($serverXml)
}

# --- Desplegar WAR en webapps de la base ---
# IMPORTANTE: antes de escribir el descriptor; con Context sin docBase,
# Tomcat necesita encontrar el WAR en appBase al desplegar el contexto.
$contextPath = $env:CONTEXT_PATH
$warDest = Join-Path $catWebapps "$contextPath.war"

$warFile = $null
if ($env:WAR_DIR) {
    $warSource = $env:WAR_DIR
    if ($warSource -like "*.war" -and (Test-Path $warSource)) {
        $warFile = $warSource
    } elseif (Test-Path "$warSource.war") {
        $warFile = "$warSource.war"
    } elseif (Test-Path $warSource) {
        $inside = Get-ChildItem -Path $warSource -Filter "*.war" -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($inside) { $warFile = $inside.FullName }
    }
}
if (-not $warFile -and $env:PROJECT_DIR) {
    # Fallback: <PROJECT_DIR>\<WAR_MODULE_DIR>\target\*.war (el mas reciente)
    $moduleDir = if ($env:WAR_MODULE_DIR) { $env:WAR_MODULE_DIR } else { "$projectName-war" }
    $tgt = Join-Path $env:PROJECT_DIR "$moduleDir\target"
    $candidate = Get-ChildItem -Path $tgt -Filter "*.war" -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($candidate) { $warFile = $candidate.FullName }
}

if ($contextPath -and $warFile) {
    $needCopy = $true
    if (Test-Path $warDest) {
        $srcHash = (Get-FileHash $warFile -Algorithm MD5).Hash
        $dstHash = (Get-FileHash $warDest -Algorithm MD5).Hash
        if ($srcHash -eq $dstHash) { $needCopy = $false }
    }
    if ($needCopy) {
        $oldDeploy = Join-Path $catWebapps $contextPath
        if (Test-Path $oldDeploy) {
            try {
                Remove-Item -Path $oldDeploy -Recurse -Force
            } catch {
                Write-Host "ERROR: No se pudo eliminar el despliegue anterior ($oldDeploy)." -ForegroundColor Red
                Write-Host "       Parece que otro proceso lo esta usando. Comprueba que no quede ningun Tomcat arrancado."
                exit 1
            }
        }
        Write-Host "Desplegando WAR en $warDest..."
        Copy-Item -Path $warFile -Destination $warDest -Force
        Write-Host "WAR desplegado" -ForegroundColor Green
    } else {
        Write-Host "WAR ya desplegado (sin cambios)"
    }
} elseif ($contextPath) {
    Write-Host "WARN: WAR no encontrado (ni por WAR_DIR ni por el fallback de target). No se despliega." -ForegroundColor Yellow
}

# --- Crear descriptor de contexto con Resource JNDI ---
# Sin docBase: el WAR ya esta en webapps y este fichero solo aporta la
# configuracion JNDI (patron Eclipse / Add and Remove)
$contextFile = Join-Path $contextDir "$($env:CONTEXT_PATH).xml"

$jndiName = if ($env:JNDI_NAME) { $env:JNDI_NAME } else { "jdbc/$($env:CONTEXT_PATH)DS" }
$jndiDriver = if ($env:JNDI_DRIVER) { $env:JNDI_DRIVER } else { "oracle.jdbc.OracleDriver" }
$jndiValidation = if ($env:JNDI_VALIDATION_QUERY) { $env:JNDI_VALIDATION_QUERY } else { "SELECT 1 FROM dual" }
$jndiMaxIdle = if ($env:JNDI_MAX_IDLE) { $env:JNDI_MAX_IDLE } else { "3" }
$jndiMaxTotal = if ($env:JNDI_MAX_TOTAL) { $env:JNDI_MAX_TOTAL } else { "9" }
# connectionProperties opcional (solo si el .env define JNDI_CONNECTION_PROPERTIES).
# NO activar oracle.net.authentication_services: con el cliente Oracle 12.2 la capa
# ANO provoca "Unknown Authentication, Encryption or Data Integrity algorithm".
$jndiConnProps = if ($env:JNDI_CONNECTION_PROPERTIES) {
    "`n            connectionProperties=`"$($env:JNDI_CONNECTION_PROPERTIES)`""
} else {
    ""
}
$dbUrlProp = if ($env:DB_URL_PROPERTY) { $env:DB_URL_PROPERTY } else { "app.db.url" }
$dbUserProp = if ($env:DB_USERNAME_PROPERTY) { $env:DB_USERNAME_PROPERTY } else { "app.db.username" }
$dbPassProp = if ($env:DB_PASSWORD_PROPERTY) { $env:DB_PASSWORD_PROPERTY } else { "app.db.password" }

$contextXml = @"
<?xml version="1.0" encoding="UTF-8"?>
<Context>
    <WatchedResource>WEB-INF/web.xml</WatchedResource>
    <Resource name="$jndiName"
            auth="Container"
            type="javax.sql.DataSource"
            driverClassName="$jndiDriver"
            url="`${$dbUrlProp}"
            username="`${$dbUserProp}"
            password="`${$dbPassProp}"$jndiConnProps
            maxIdle="$jndiMaxIdle"
            maxTotal="$jndiMaxTotal"
            testOnBorrow="true"
            validationQuery="$jndiValidation"/>
</Context>
"@

Set-Content -Path $contextFile -Value $contextXml -Encoding UTF8
Write-Host "Contexto: $contextFile"

# --- Variables Tomcat ---
[Environment]::SetEnvironmentVariable("CATALINA_HOME", $env:TOMCAT_HOME, "Process")
[Environment]::SetEnvironmentVariable("CATALINA_BASE", $catBase, "Process")
[Environment]::SetEnvironmentVariable("CATALINA_TMPDIR", $catTemp, "Process")

# --- Resumen ---
Write-Host ""
Write-Host "============================================================"
Write-Host " $projectName - Tomcat"
Write-Host "============================================================"
Write-Host " Tomcat:        $($env:TOMCAT_HOME)"
Write-Host " Java:          $($env:JAVA_HOME)"
Write-Host " Puerto:        $($env:TOMCAT_PORT)"
Write-Host " Contexto:      /$($env:CONTEXT_PATH)"
if ($env:WAR_DIR) { Write-Host " WAR:           $($env:WAR_DIR)" }
Write-Host " CATALINA_BASE: $catBase"
Write-Host " Config:        $catConf"
Write-Host " Logs:          $catLogs"
 Write-Host " Temp:          $catTemp"
 Write-Host " Docker:        $dockerSummary"
 Write-Host ""
Write-Host " URL: http://localhost:$($env:TOMCAT_PORT)/$($env:CONTEXT_PATH)/"
Write-Host " Webapps:       $catWebapps"
Write-Host "============================================================"
Write-Host ""

# --- Classpath ---
$classpath = (Join-Path $env:TOMCAT_HOME "bin\bootstrap.jar") + ";" + (Join-Path $env:TOMCAT_HOME "bin\tomcat-juli.jar")

function Quote($val) { return "`"$val`"" }

# --- JVM args ---
$jvmArgs = @()
$jvmArgs += Quote "-Xms$($env:JVM_XMS)"
$jvmArgs += Quote "-Xmx$($env:JVM_XMX)"
$jvmArgs += Quote "-XX:MaxMetaspaceSize=$($env:JVM_MAX_METASPACE)"
$jvmArgs += "--add-opens=java.base/java.lang=ALL-UNNAMED"
$jvmArgs += "--add-opens=java.base/java.io=ALL-UNNAMED"
$jvmArgs += "--add-opens=java.base/java.util=ALL-UNNAMED"
$jvmArgs += "--add-opens=java.base/java.util.concurrent=ALL-UNNAMED"
$jvmArgs += "--add-opens=java.rmi/sun.rmi.transport=ALL-UNNAMED"
$jvmArgs += Quote "-Dcatalina.base=$catBase"
$jvmArgs += Quote "-Dcatalina.home=$env:TOMCAT_HOME"
$jvmArgs += Quote "-Djava.io.tmpdir=$catTemp"
$jvmArgs += Quote "-Djava.util.logging.config.file=$catConf\logging.properties"
$jvmArgs += "-Djava.util.logging.manager=org.apache.juli.ClassLoaderLogManager"
$jvmArgs += Quote "-Dapps_env=$($env:APPS_ENV)"
$jvmArgs += Quote "-Dapps_config_path=$($env:APPS_CONFIG_PATH)"
$jvmArgs += Quote "-Dapps_cert_path=$($env:APPS_CERT_PATH)"
$jvmArgs += Quote "-Dapps_data_path=$($env:APPS_DATA_PATH)"
$jvmArgs += Quote "-Dapps_temp_path=$($env:APPS_TEMP_PATH)"
$jvmArgs += Quote "-Dapps_log_path=$($env:APPS_LOG_PATH)"
$jvmArgs += Quote "-Dapps_resource_path=$($env:APPS_RESOURCE_PATH)"
$jvmArgs += Quote "-Dtomcat.name=$projectName"
$jvmArgs += Quote "-DapplicationCode=$projectName"
$jvmArgs += Quote "-Dfile.encoding=UTF-8"

# DB variables: _PROPERTY -> -D<valor>=<valor resuelto>
$dbVars = Get-ChildItem Env: | Where-Object { $_.Name -match "_PROPERTY$" }
foreach ($v in $dbVars) {
    $propKey = $v.Value
    $resolvedName = $v.Name -replace "_PROPERTY$", ""
    $propVal = [Environment]::GetEnvironmentVariable($resolvedName, "Process")
    if (-not $propVal) {
        $propVal = [System.Environment]::GetEnvironmentVariable($resolvedName)
    }
    if ($propVal) {
        $jvmArgs += Quote "-D$propKey=$propVal"
    }
}

if ($env:JAVAX_NET_SSL_TRUSTSTORE) {
    $jvmArgs += Quote "-Djavax.net.ssl.trustStore=$($env:JAVAX_NET_SSL_TRUSTSTORE)"
}
if ($env:JAVAX_NET_SSL_TRUSTSTORE_PASSWORD) {
    $jvmArgs += Quote "-Djavax.net.ssl.trustStorePassword=$($env:JAVAX_NET_SSL_TRUSTSTORE_PASSWORD)"
}

# --- EXTRA_JVM_ARGS ---
if ($env:EXTRA_JVM_ARGS) {
    $env:EXTRA_JVM_ARGS -split '\s+' | Where-Object { $_ } | ForEach-Object {
        $jvmArgs += $_
    }
}

# --- Depuracion remota (JDWP) ---
# El puerto llega como argumento del launcher (aislado del build). Se anade el
# agente de depuracion de la JVM para conectar el depurador de VS Code (attach).
if ($debugPort) {
    $suspend = if ($debugSuspend -and $debugSuspend -ieq "y") { "y" } else { "n" }
    $jvmArgs += Quote "-agentlib:jdwp=transport=dt_socket,server=y,suspend=$suspend,address=*:$debugPort"
    Write-Host "MODO DEPURACION: JDWP activo en el puerto $debugPort (suspend=$suspend)" -ForegroundColor Magenta
}

# applicationCode para el motor de cifrado (semilla en APPS_CERT_PATH\<code>)
if (-not ($jvmArgs | Where-Object { $_ -match "applicationCode=" })) {
    $jvmArgs += Quote "-DapplicationCode=$($env:CONTEXT_PATH)"
}

$jvmArgs += "-classpath"
$jvmArgs += Quote $classpath
$jvmArgs += "org.apache.catalina.startup.Bootstrap"
$jvmArgs += "start"

# --- Arrancar ---
$javaExe = Join-Path $env:JAVA_HOME "bin\java.exe"

# --- Exportar a la carpeta del proyecto los VM options listos para SmartTomcat ---
# Se omiten los que SmartTomcat gestiona por si mismo (catalina.*, tmpdir,
# logging, classpath y comando de arranque) y los defaults de memoria/add-opens.
$argsFile = Join-Path $projectDir "jvm-args.txt"
$smartArgs = New-Object System.Collections.Generic.List[string]
$skipNext = $false
foreach ($a in $jvmArgs) {
    $bare = $a.Trim('"')
    if ($skipNext) { $skipNext = $false; continue }
    if ($bare -eq "-classpath") { $skipNext = $true; continue }
    if ($bare -in @("org.apache.catalina.startup.Bootstrap", "start")) { continue }
    if ($bare -match "^-D(catalina\.base|catalina\.home|java\.io\.tmpdir|java\.util\.logging\.config\.file|java\.util\.logging\.manager|tomcat\.name)=") { continue }
    if ($bare -match "^-Xms|^\-Xmx|^\-XX:MaxMetaspaceSize=") { continue }
    if ($bare -match "^--add-opens=") { continue }
    $smartArgs.Add($bare)
}
$exportLines = @(
    "# VM options para SmartTomcat - $projectName - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
)
$exportLines += ($smartArgs -join " ")
Set-Content -Path $argsFile -Value $exportLines -Encoding UTF8
Write-Host "VM options para SmartTomcat exportados a: $argsFile"

Write-Host "Arrancando Tomcat en este terminal (logs en directo)..."
Write-Host "Para detener: .\scripts\stop-app.ps1 $projectName (o Ctrl+C aqui)"
$process = Start-Process -FilePath $javaExe -ArgumentList $jvmArgs -NoNewWindow -PassThru

Write-Host ""
Write-Host "Tomcat arrancado (PID: $($process.Id)). Para detener: .\scripts\stop-app.ps1 $projectName"

# --- Espera a que la aplicacion arranque de verdad ---
# No basta con que el script termine: comprobamos que Tomcat enlazo el puerto y
# que aparezca el marcador de arranque completo en los logs de la base del
# proyecto (o, si hay HEALTH_CHECK_URL, que devuelva 2xx/3xx). Asi no decimos
# "sin respuesta" cuando la app ya esta arriba (p.ej. el contexto raiz da 404).
$interval = if ($env:HEALTH_CHECK_INTERVAL) { [int]$env:HEALTH_CHECK_INTERVAL } else { 2 }
if ($env:HEALTH_CHECK_TIMEOUT) {
    $healthTimeout = [int]$env:HEALTH_CHECK_TIMEOUT
} elseif ($env:HEALTH_CHECK_MAX_ATTEMPTS) {
    $healthTimeout = [int]$env:HEALTH_CHECK_MAX_ATTEMPTS * $interval
} else {
    $healthTimeout = 120
}

$readyMarkers = @("Server startup in", "Deployment of web application directory", "Started .* in .* seconds", "Apache Tomcat started")
$deadline = (Get-Date).AddSeconds($healthTimeout)
$ready = $false
$lastStatus = $null
$portUp = $false

Write-Host ""
Write-Host "Esperando a que $projectName arranque (hasta $healthTimeout s)..."

while ((Get-Date) -lt $deadline) {
    # 1) Puerto escuchando (Tomcat enlazado)
    $portUp = $false
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $tcp.Connect("127.0.0.1", [int]$env:TOMCAT_PORT)
        $tcp.Close()
        $portUp = $true
    } catch {}

    # 2) Marcador de arranque completo en los logs de la base del proyecto
    $markerFound = $false
    if (Test-Path $catLogs) {
        $logFile = Get-ChildItem -Path $catLogs -Filter "catalina*.log" -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($logFile) {
            $tail = Get-Content -Path $logFile.FullName -Tail 60 -ErrorAction SilentlyContinue
            foreach ($mk in $readyMarkers) {
                if ($tail -match $mk) { $markerFound = $true; break }
            }
        }
    }

    # 3) HEALTH_CHECK_URL (si esta definido)
    if ($env:HEALTH_CHECK_URL) {
        try {
            $resp = Invoke-WebRequest -Uri $env:HEALTH_CHECK_URL -UseBasicParsing -TimeoutSec 5 -ErrorAction SilentlyContinue
            $lastStatus = [int]$resp.StatusCode
            if ($resp.StatusCode -in @(200, 302)) { $ready = $true; break }
        } catch {
            $lastStatus = $null
        }
    }

    # Criterio de listo: puerto arriba + marcador de arranque en el log.
    if ($portUp -and $markerFound) { $ready = $true; break }

    Start-Sleep -Seconds $interval
}

if ($ready) {
    if ($env:HEALTH_CHECK_URL -and $lastStatus -and $lastStatus -notin @(200, 302)) {
        Write-Host "Aplicacion arrancada (Tomcat escucha y marcador de arranque en log). HEALTH_CHECK_URL devolvio $lastStatus." -ForegroundColor Green
    } else {
        Write-Host "Aplicacion lista." -ForegroundColor Green
    }
} else {
    if ($portUp) {
        Write-Host "WARN: Tomcat escucha en el puerto pero no se detecto el arranque completo de la app. Revisa los logs en $catLogs" -ForegroundColor Yellow
    } else {
        Write-Host "WARN: sin respuesta tras $healthTimeout s. Revisa los logs de Tomcat en $catLogs" -ForegroundColor Yellow
    }
}
