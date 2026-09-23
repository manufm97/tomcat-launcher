# Tomcat Launcher

Aplicación de escritorio basada en Electron para iniciar, gestionar y depurar proyectos Java basados en Tomcat, con consola integrada, configuración y detección de pruebas.

---

## Tabla de Contenidos

1. [Inicio Rápido](#inicio-rápido)
2. [Primeros Pasos](#primeros-pasos)
3. [Uso de la Interfaz](#uso-de-la-interfaz)
   - [Selector de Proyecto](#selector-de-proyecto)
   - [Botones de Acción](#botones-de-acción)
   - [Modals](#modals)
4. [Añadir un Nuevo Proyecto](#añadir-un-nuevo-proyecto)
5. [Configuración (.env)](#-configuración-env)
6. [Soporte Docker](#-soporte-docker)
7. [Explorador de Pruebas](#explorador-de-pruebas)
8. [Despliegue desde PowerShell](#despliegue-desde-powershell)
9. [Solución de Problemas](#solución-de-problemas)
10. [Estructura de Archivos](#estructura-de-archivos)

---

## Inicio Rápido

```powershell
# 1. Ejecuta la aplicación
npm start

# 2. Selecciona la carpeta base de proyectos (solo la primera vez)
#    - Pulsa el botón "Ruta base" en la barra superior
#    - O ejecuta: .\scripts\start-app.ps1 y sigue el diálogo

# 3. Añade un proyecto nuevo usando el botón + en la interfaz
#    - O crea la carpeta manualmente y ejecuta: .\scripts\start-app.ps1 <nombre>
```

---

## Primeros Pasos

### 1. Ejecutar la Aplicación

```powershell
npm start
```

Al iniciar, la aplicación pedirá que seleccione la **carpeta base de proyectos** (directorio `resources`). Esta elección se guarda persistentemente en `%APPDATA%\TomcatLauncher\settings.json`.

### 2. Elección de la Carpeta Base

- Pulsa el botón **Ruta base** (folder icon) en la barra superior
- O selecciona "Elegir ruta base de proyectos" desde el menú
- La carpeta debe contener subcarpetas de proyectos con ficheros `.env`

---

## Uso de la Interfaz

### Selector de Proyecto

La aplicación muestra una lista de proyectos detectados en la carpeta base. Cada proyecto debe tener un fichero `.env` en su raíz con las variables obligatorias (ver sección de Variables `.env`).

### Botones de Acción

| Botón                          | Atajo            | Descripción                                                 |
| ------------------------------- | ---------------- | ------------------------------------------------------------ |
| **Iniciar**               | `Ctrl+R`       | Arranca el proyecto seleccionado en Tomcat                   |
| **Depurar**               | `Ctrl+D`       | Arranca con depuración JDWP (VS Code attach; abre backend y frontend si `PROJECT_DIR_FRONTEND` está definido) |
| **Detener**               | `Ctrl+S`       | Detiene el Tomcat en ejecución                              |
| **Abrir en navegador**    | `Ctrl+L`       | Abre la URL de la aplicación en el navegador predeterminado |
| **Explorador de pruebas** | `Ctrl+T`       | Abre el analizador de tests JUnit/TestNG                     |
| **Limpiar consola**       | `Ctrl+K`       | Borra la consola inferior                                    |
| **Ver logs**              | `Ctrl+Shift+L` | Abre el visor de logs de Tomcat                              |
| **Configuración**        | `Ctrl+Shift+C` | Edita el fichero`.env` del proyecto                        |
| **Abrir en VS Code**      | `Ctrl+Shift+V` | Abre el proyecto en VS Code (backend y frontend si `PROJECT_DIR_FRONTEND` está definido) |
| **Ruta base**             | `Ctrl+Shift+P` | Cambia la carpeta base de proyectos                          |
| **Añadir proyecto**      | `Ctrl+Shift+N` | Crea un nuevo proyecto desde la plantilla                    |

### Modals

- **Nuevo Proyecto**: Crear un proyecto nuevo usando la plantilla `docs/.env.ejemplo`
- **Configuración (.env)**: Editar todas las variables de configuración
- **Logs de Tomcat**: Ver y seguir los logs en tiempo real
- **Explorador de pruebas**: Descubrir y ejecutar tests unitarios

---

## Añadir un Nuevo Proyecto

### Desde la Interfaz (Recomendado)

1. Pulsa el botón **+** (Añadir proyecto) en la barra superior
2. Introduce el nombre del proyecto (solo letras, números, `_`, `-`, `.`)
3. Selecciona el **JAVA_HOME** del desplegable (o escribe una ruta personalizada)
4. Selecciona el **TOMCAT_HOME** del desplegable (o escribe una ruta personalizada)
5. Marca/desmarca **"Requiere servicios Docker"** si es necesario
6. Si hay Docker, indica la ruta del fichero `docker-compose.yml` (opcional) y el puerto a esperar (opcional)
7. Pulsa **Crear**

La aplicación creará automáticamente:

- `resources\<nombre_proyecto>\` carpeta
- `resources\<nombre_proyecto>\.env` configurado con los valores proporcionados

### Desde PowerShell

```powershell
# 1. Copia la plantilla
Copy-Item docs\.env.ejemplo resources\nuevo-proyecto\.env

# 2. Edita el .env (mínimo obligatorio)
notepad resources\nuevo-proyecto\.env

# 3. Arranca
.\scripts\start-app.ps1 nuevo-proyecto
```

---

## Configuración (.env)

Cada proyecto tiene un fichero `.env` en su raíz con las siguientes variables:

### Variables Obligatorias

| Variable           | Descripción                               | Ejemplo                                                    |
| ------------------ | ------------------------------------------ | ---------------------------------------------------------- |
| `PROJECT_DIR`    | Raíz del proyecto Maven                   | `C:\Git\mi_app`                                          |
| `WAR_MODULE_DIR` | Nombre del módulo WAR (sin ruta completa) | `mi_app-war`                                             |
| `CONTEXT_PATH`   | Context path de la app                     | `mi_app`                                                 |
| `TOMCAT_HOME`    | Instalación de Tomcat                     | `C:\Program Files\Apache Software Foundation\Tomcat 9.0` |
| `JAVA_HOME`      | Directorio del JDK                         | `C:\Program Files\Java\jdk-11.0.21`                      |

### Variables de Base de Datos (Registro Windows)

Las passwords **no** van en el `.env`. Se leen del registro mediante `*_REGVAR`:

| Variable                 | Descripción                                     |
| ------------------------ | ------------------------------------------------ |
| `DB_URL_PROPERTY`      | Nombre de la propiedad Java                      |
| `DB_URL_REGVAR`        | Variable de entorno del registro con la URL      |
| `DB_USERNAME_PROPERTY` | Nombre de la propiedad Java                      |
| `DB_USERNAME_REGVAR`   | Variable de entorno del registro con el usuario  |
| `DB_PASSWORD_PROPERTY` | Nombre de la propiedad Java                      |
| `DB_PASSWORD_REGVAR`   | Variable de entorno del registro con la password |

### Variables Opcionales (con Defaults)

| Variable                 | Default                        |
| ------------------------ | ------------------------------ |
| `TOMCAT_PORT`          | `8080`                       |
| `TOMCAT_SHUTDOWN_PORT` | `8005`                       |
| `APPS_BASE_PATH`       | `C:\apps_env`                |
| `APPS_CONFIG_PATH`     | `<APPS_BASE_PATH>\config`    |
| `APPS_LOG_PATH`        | `<APPS_BASE_PATH>\logs`      |
| `APPS_DATA_PATH`       | `<APPS_BASE_PATH>\data`      |
| `APPS_TEMP_PATH`       | `<APPS_BASE_PATH>\temp`      |
| `APPS_RESOURCE_PATH`   | `<APPS_BASE_PATH>\resources` |
| `START_DOCKER`         | `false`                      |
| `DOCKER_WAIT_TIMEOUT`  | `90` (segundos)              |
| `HEALTH_CHECK_URL`     | (ninguno)                      |
| `DEBUG_PORT`           | (ninguno)                      |
| `PROJECT_DIR_FRONTEND` | (ninguno)                      |
| `EXTRA_JVM_ARGS`       | (ninguno)                      |
| `SKIP_BUILD`           | `false`                      |
| `TEST_DIR`             | (personalizado)                |
| `DOCKER_COMPOSE_FILE`  | auto-detectado                 |
| `DOCKER_WAIT_PORT`     | (ninguno)                      |
| `DOCKER_HEALTH_URL`    | (ninguno)                      |

### Editar desde la Interfaz

1. Pulsa el botón **Configuración** (tune icon) para el proyecto activo
2. El modal muestra todas las variables con su tipo y descripción
3. Modifica los valores y pulsa **Guardar**
4. Los cambios se escriben directamente en el fichero `.env`

### Editar desde PowerShell

```powershell
# Ver config actual
Get-Content resources\mi-proyecto\.env

# Añadir/modificar variable
Set-Content resources\mi-proyecto\.env -Value @(
    "PROJECT_DIR=C:\Git\mi_app",
    "WAR_MODULE_DIR=mi_app-war",
    "CONTEXT_PATH=mi_app",
    "TOMCAT_HOME=C:\Program Files\Apache Software Foundation\Tomcat 9.0",
    "JAVA_HOME=C:\Program Files\Java\jdk-11.0.21",
    "TOMCAT_PORT=8080",
    "START_DOCKER=true",
    "DOCKER_COMPOSE_FILE=resources\mi-proyecto\docker\docker-compose.yml"
)
```

---

## Soporte Docker

La aplicación soporta el arranque de servicios Docker antes de iniciar Tomcat.

### Configuración

1. Al crear un proyecto, marca **"Requiere servicios Docker"**
2. Indica la ruta del fichero `docker-compose.yml` (o deja vacío para auto-detectar)
3. Opcional: Puerto a esperar (`DOCKER_WAIT_PORT`) y URL de salud (`DOCKER_HEALTH_URL`)

### Auto-detección

Si no se indica la ruta, la búsqueda sigue este orden:

1. `resources\<proyecto>\docker\docker-compose.yml / compose.yml`
2. `resources\<proyecto>\docker-compose.yml / compose.yml`
3. `<PROJECT_DIR>\docker\docker-compose.yml / compose.yml`
4. `<PROJECT_DIR>\docker-compose.yml / compose.yml`

### Variables Docker en el .env

| Variable                | Descripción                                              |
| ----------------------- | --------------------------------------------------------- |
| `START_DOCKER`        | `true` para activar (bool)                              |
| `DOCKER_COMPOSE_FILE` | Ruta al fichero compose                                   |
| `DOCKER_WAIT_PORT`    | Puerto que debe estar escuchando antes de arrancar Tomcat |
| `DOCKER_HEALTH_URL`   | URL que debe devolver 200/302 para considerarse lista     |
| `DOCKER_WAIT_TIMEOUT` | Segundos de espera máximo (default: 90)                  |

### Detener Servicios Docker

Al ejecutar `stop-app.ps1`, los contenedores Docker definidos en el `.env` se detienen automáticamente si `START_DOCKER=true`.

---

## Explorador de Pruebas

La aplicación incluye un explorador de tests integrado que:

1. **Descubre tests**: Escanea directorios `src/test/java` y ficheros `surefire-reports`
2. **Muestra resultados**: Visualiza clases y métodos con su estado (pass/fail/skip)
3. **Ejecución**: Ejecuta tests seleccionados o todos mediante Maven
4. **Modo master**: Checkbox "Seleccionar todo" para marcar/deseleccionar todos

### Uso

1. Pulsa el botón **Explorador de pruebas** ( flask icon)
2. El árbol muestra clases y métodos disponibles
3. Marca las casillas para seleccionar tests específicos
4. Pulsa **Ejecutar seleccionados** o **Ejecutar todo**
5. Los resultados se actualizan en tiempo real en la consola

### Desde PowerShell

```powershell
# Descubrir tests
.\scripts\start-app.ps1 mi-proyecto --discover-tests

# Ejecutar todos
mvn test -f pom.xml -DfailIfNoTests=false

# Ejecutar tests específicos
mvn test -Dtest=ClaseTest,# metodo1,# metodo2 -DfailIfNoTests=false
```

---

## Despliegue desde PowerShell

Los scripts `scripts/start-app.ps1` y `scripts/stop-app.ps1` se pueden ejecutar directamente desde PowerShell para uso sin la interfaz gráfica.

### start-app.ps1

```powershell
# Uso básico
.\scripts\start-app.ps1 mi-proyecto

# Con puerto de depuración
.\scripts\start-app.ps1 mi-proyecto 8000 y

# Variables de entorno opcionales (heredadas por el script)
# APPS_BASE_PATH, APPS_ENV, etc. vienen del .env del proyecto
```

### stop-app.ps1

```powershell
.\scripts\stop-app.ps1 mi-proyecto
```

### Build Script

```powershell
# Compilar el paquete de distribución
.\scripts\build.ps1
```

---

## Solución de Problemas

### La app no arranca

1. **Revisa los logs**:

   - Consola inferior de la aplicación
   - `C:\apps_env\logs\<proyecto>\` (logs propios de la app)
   - `<TOMCAT_HOME>\logs\catalina*.log` (logs de Tomcat)
2. **Verifica variables obligatorias** en el `.env`:

   - `PROJECT_DIR`, `WAR_MODULE_DIR`, `CONTEXT_PATH`, `TOMCAT_HOME`, `JAVA_HOME`
3. **Puerto en uso**:

   ```powershell
   netstat -ano | findstr :8080
   # Identifica el PID y deténlo: Stop-Process -Id <PID> -Force
   ```
4. **Errores de Maven**:

   - Asegúrate de que `mvn` esté en PATH o usa `mvnw.cmd`
   - Verifica variables `SKIP_BUILD=true` si ya tienes el WAR compilado

### Puerto 8080 ocupado

El launcher configura puertos por proyecto, pero si hay conflicto:

```powershell
# Verificar qué usa el puerto
Get-NetTCPConnection -LocalPort 8080

# Matar procesos Java que usen el nombre del proyecto
Get-Process java | Where-Object {
    $cmd -and $cmd -match "-Dtomcat\.name=mi-proyecto"
} | Stop-Process -Force
```

### Error de compilación EBUSCrowdStrike

Si usas CrowdStrike o antivirus que bloquea archivos, el script `build.ps1` usa `robocopy /MIR` que no requiere borrar el directorio destino. Ejecuta `.\scripts\build.ps1` para rebuild limpio.

---

## Estructura de Archivos

```
C:\apps_env\resources\          # Carpeta base seleccionada por el usuario
│
├── launcher\                   # Auto-contenido, listo para compartir
│   ├── main.js / renderer.js / preload.js / index.html
│   ├── scripts/
│   │   ├── start-app.ps1     # Ciclo completo: build + config + deploy + arranque
│   │   └── stop-app.ps1      # Parada generica (PowerShell)
│   ├── docs/
│   │   └── .env.ejemplo      # Template para nuevos proyectos
│   └── ...
│
├── app_1/                      # Proyecto 1
│   └── .env                    # Java 21 + Tomcat 10.1
│
├── app_2/                      # Proyecto 2
│   └── .env                    # Java 11 + Tomcat 9.0
│
└── app_3/                      # Proyecto 3
    └── .env                    # Java 11 + Tomcat 9.0
```

### Plantilla `.env.ejemplo`

La plantilla se encuentra en `docs/.env.ejemplo` y contiene todos los comentarios y estructura base. Al crear un nuevo proyecto, la aplicación la copia y reemplaza los placeholders `<nombre_proyecto>` y `<NOMBRE>`.

---

## Tecnologías Utilizadas

- **Electron** - Aplicación de escritorio
- **TypeScript** - Código fuente
- **Maven** - Build y gestión de dependencias
- **PowerShell** - Scripts de arranque/parada de Tomcat
- **Docker** - Servicios auxiliares (opcional)
- **JUnit/TestNG** - Framework de tests

---

## Atribución

Inspirado en el flujo de trabajo de **Eclipse WTP** (Web Tools Platform) con bases Tomcat aisladas por proyecto.

Licencia: MIT
