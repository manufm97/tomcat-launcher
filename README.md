# Despliegue local - Proyectos

Sistema escalable para compilar, desplegar y arrancar proyectos Java/Tomcat.
Cada proyecto solo necesita un fichero `.env`.

Replica el flujo de Eclipse WTP con **base Tomcat aislada por proyecto**:
cada app corre en `<TOMCAT_HOME>\<proyecto>\` con sus propias carpetas
`conf/`, `webapps/`, `logs/`, `temp/` y `work/` (creadas al primer arranque),
todas escuchando en el puerto 8080 (una arrancada cada vez). La conexion a BD
se define en el descriptor de contexto de la base y las rutas `APPS_*` se
derivan automaticamente de `APPS_BASE_PATH`.

Al arrancar por primera vez, el launcher (Electron) pide la carpeta base de
proyectos (`resources`) con un dialogo y la guarda en
`%APPDATA%\TomcatLauncher\settings.json`. Tambien puedes cambiarla desde el
boton carpeta de la barra superior. Los scripts `scripts/start-app.ps1` y
`scripts/stop-app.ps1` viven dentro de la propia carpeta `launcher\`, por lo que el
launcher es auto contenido y facil de compartir.

Al arrancar, `scripts/start-app.ps1` se encarga de todo el ciclo:

1. Para el Tomcat si ya estaba corriendo
2. Compila con Maven (`clean install -DskipTests`) — omítelo con `SKIP_BUILD=true` en el `.env`
3. Copia la configuración de `<proyecto>-config` y `<proyecto>-resources` para el entorno indicado
4. Arranca los servicios Docker si `START_DOCKER=true` y el proyecto tiene carpeta `docker/` (o `DOCKER_COMPOSE_FILE`)
5. Desactiva las demás apps del mismo Tomcat (solo queda desplegada la solicitada)
6. Configura puertos, contexto JNDI y despliega el WAR en `webapps`
7. Arranca y espera respuesta del health check si hay `HEALTH_CHECK_URL`

### Servicios Docker

Algunas apps no funcionan sin su config
server. Si el proyecto tiene un fichero compose se levanta automáticamente
antes de Tomcat:

- Solo arranca Docker si `START_DOCKER=true`.
- Se busca en `resources\<proyecto>\docker\` y, después, en `PROJECT_DIR`
  (`docker-compose.yml` / `docker-compose.yaml` / `compose.yml` / `compose.yaml`).
- Desde el launcher: al crear el proyecto marca **Requiere servicios Docker** e
  indica la ruta del compose (y opcionalmente el puerto a esperar); también se
  ajusta después en el modal de configuración, sección **Servicios Docker**.
- Las variables del `.env` (p.ej. `ENCRYPT_KEY`) se pasan al compose.

## Uso (desde PowerShell dentro de `launcher`)

```powershell
# Arrancar
.\scripts\start-app.ps1 app_1
.\scripts\start-app.ps1 app_2
.\scripts\start-app.ps1 app_3

# Detener
.\scripts\stop-app.ps1 app_1
.\scripts\stop-app.ps1 app_2
.\scripts\stop-app.ps1 app_3
```

Si no pasas parametro, muestra los proyectos disponibles de la carpeta base.

---

## Como agregar un nuevo proyecto

### Desde el launcher (recomendado)

Pulsa el boton **+** junto al selector de proyecto. Se abre un dialogo donde:

1. Introduces el nombre del proyecto
2. Seleccionas el JDK de Java del desplegable (escanea automaticamente `C:\Program Files\Java`, `Eclipse Adoptium`, `Amazon Corretto`, etc.)
3. Seleccionas la version de Tomcat del desplegable (escanea `C:\Program Files\Apache Software Foundation`)
4. El launcher crea la carpeta en `resources\<proyecto>` con el `.env` generado automaticamente a partir de `docs/.env.ejemplo`

### Manualmente

```powershell
mkdir C:\apps_env\resources\<nuevo>
Copy-Item .\docs\.env.ejemplo C:\apps_env\resources\<nuevo>\.env
notepad C:\apps_env\resources\<nuevo>\.env
```

Editar como minimo:

```ini
PROJECT_DIR=C:\Git\<nuevo>
WAR_MODULE_DIR=<nuevo>-war
CONTEXT_PATH=<nuevo>
TOMCAT_HOME=C:\Program Files\Apache Software Foundation\Tomcat 9.0
JAVA_HOME=C:\Program Files\Java\jdk-11.0.21
```

### Variables de BD en el registro

```powershell
[Environment]::SetEnvironmentVariable("ORACLE_URL", "jdbc:oracle:thin:@...", "User")
[Environment]::SetEnvironmentVariable("DB_USER_NUEVO", "USUARIO", "User")
[Environment]::SetEnvironmentVariable("DB_PASS_NUEVO", "PASSWORD", "Pass")
```

### Arrancar

```powershell
.\scripts\start-app.ps1 <nuevo>
```

**No hay mas pasos.** El script lee todo del `.env`.

---

## Estructura

```
C:\apps_env\resources\        # <- carpeta base que el launcher te pide
│
├── launcher\                 # <- auto contenido, listo para compartir
│   ├── main.js / renderer.js / preload.js / index.html
│   ├── scripts/
│   │   ├── start-app.ps1     # Ciclo completo: build + config + deploy + arranque
│   │   └── stop-app.ps1      # Parada generica (PowerShell)
│   ├── docs/
│   │   └── .env.ejemplo      # Template para nuevos proyectos
│   └── ...
│
├── app_1/
│   └── .env              # Java 21 + Tomcat 10.1
├── app_2/
│   └── .env              # Java 11 + Tomcat 9.0
└── app_3/
    └── .env              # Java 11 + Tomcat 9.0
```

Nota: cada proyecto es una carpeta de la base con un fichero `.env` en su raiz.

---

## Variables .env

### Obligatorias

| Variable           | Descripcion                               | Ejemplo                                                    |
| ------------------ | ----------------------------------------- | ---------------------------------------------------------- |
| `PROJECT_DIR`    | Raiz del proyecto Maven                   | `C:\Git\mi_app`                                          |
| `WAR_MODULE_DIR` | Nombre del modulo WAR (sin ruta completa) | `mi_app-war`                                             |
| `CONTEXT_PATH`   | Context path de la app                    | `mi_app`                                                 |
| `TOMCAT_HOME`    | Instalacion de Tomcat                     | `C:\Program Files\Apache Software Foundation\Tomcat 9.0` |
| `JAVA_HOME`      | Directorio del JDK                        | `C:\Program Files\Java\jdk-11.0.21`                      |

### Base de datos

Las passwords NO van en el `.env`. Se leen del registro via `*_REGVAR`:

| Variable                 | Descripcion                                      |
| ------------------------ | ------------------------------------------------ |
| `DB_URL_PROPERTY`      | Nombre de la propiedad Java                      |
| `DB_URL_REGVAR`        | Variable de entorno del registro con la URL      |
| `DB_USERNAME_PROPERTY` | Nombre de la propiedad Java                      |
| `DB_USERNAME_REGVAR`   | Variable de entorno del registro con el usuario  |
| `DB_PASSWORD_PROPERTY` | Nombre de la propiedad Java                      |
| `DB_PASSWORD_REGVAR`   | Variable de entorno del registro con la password |

### Opcionales (tienen default)

| Variable                 | Default                               |
| ------------------------ | ------------------------------------- |
| `TOMCAT_PORT`          | `8080`                              |
| `TOMCAT_SHUTDOWN_PORT` | `8005`                              |
| `APPS_BASE_PATH`       | `C:\apps_env`                       |
| `APPS_CONFIG_PATH`     | `<APPS_BASE_PATH>\config`           |
| `APPS_LOG_PATH`        | `<APPS_BASE_PATH>\logs`             |
| `APPS_DATA_PATH`       | `<APPS_BASE_PATH>\data`             |
| `APPS_TEMP_PATH`       | `<APPS_BASE_PATH>\temp`             |
| `APPS_RESOURCE_PATH`   | `<APPS_BASE_PATH>\resources`        |
| `CATALINA_BASE`        | `<TOMCAT_HOME>\<proyecto>`          |
| `START_DOCKER`         | `false` (Boolean)                   |
| `DOCKER_COMPOSE_FILE`  | auto: carpeta`docker/` del proyecto |
| `DOCKER_WAIT_PORT`     | (ninguno: no espera)                  |
| `DOCKER_HEALTH_URL`    | (ninguno: no comprueba)               |
| `DOCKER_WAIT_TIMEOUT`  | `90` (segundos)                     |

`SKIP_BUILD` y `START_DOCKER` se editan como interruptores Boolean en la configuración de la app.

Si no se indican, las rutas `APPS_*` se derivan solas a partir de `APPS_BASE_PATH`.

## Troubleshooting

**La app no arranca:**

- Revisa logs: `C:\apps_env\logs\<proyecto>\`
- Logs de Tomcat: `<TOMCAT_HOME>\logs\catalina.out` / `catalina-<fecha>.log`
- Verifica variables de BD en el registro

**Puerto en uso:**

```powershell
netstat -ano | findstr :8080
Stop-Process -Id <PID> -Force
```
