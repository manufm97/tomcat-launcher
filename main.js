"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const electron_1 = require("electron");
const child_process_1 = require("child_process");
const SCRIPT_DIR = __dirname;
const ICON_PATH = path.join(__dirname, "app.ico");
const SETTINGS_PATH = path.join(electron_1.app.getPath("userData"), "settings.json");
let mainWindow = null;
let runningProc = null;
let tailTimer = null;
let isRunning = false;
let appRunning = false;
let startedProject = null;
let modalTail = null;
let testProc = null;
let RESOURCES_PATH = null;
const SHORTCUTS = {
    "ctrl+r": "start",
    "ctrl+d": "debug",
    "ctrl+s": "stop",
    "ctrl+l": "open-url",
    "ctrl+t": "tests",
    "ctrl+k": "clear",
    "ctrl+shift+l": "logs",
    "ctrl+shift+c": "config",
    "ctrl+shift+v": "vscode",
    "ctrl+shift+p": "base-path",
    "ctrl+shift+n": "add-project",
};
function readResourcesPath() {
    try {
        const data = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8"));
        if (data && data.resourcesPath && fs.existsSync(data.resourcesPath))
            return data.resourcesPath;
    }
    catch (e) { }
    return null;
}
function saveResourcesPath(p) {
    try {
        fs.writeFileSync(SETTINGS_PATH, JSON.stringify({ resourcesPath: p }), "utf8");
    }
    catch (e) { }
}
async function ensureResourcesPath() {
    RESOURCES_PATH = readResourcesPath();
    if (!RESOURCES_PATH) {
        const res = await electron_1.dialog.showOpenDialog(mainWindow, {
            title: "Elige la carpeta base de proyectos (resources)",
            properties: ["openDirectory"],
        });
        if (res.canceled || !res.filePaths[0]) {
            electron_1.app.quit();
            return false;
        }
        RESOURCES_PATH = res.filePaths[0];
        saveResourcesPath(RESOURCES_PATH);
    }
    return true;
}
function sendConsole(text) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("console", String(text));
    }
}
function sendStatus(text) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("status", String(text));
    }
}
function sendTestProgress(payload) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("test-progress", JSON.stringify(payload));
    }
}
function setAppRunning(state) {
    appRunning = state;
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("running", state);
    }
}
function stripAnsi(str) {
    return str.replace(/\[[0-9;]*m/g, "");
}
function listProjects() {
    let entries;
    try {
        entries = fs.readdirSync(RESOURCES_PATH, { withFileTypes: true });
    }
    catch (e) {
        return [];
    }
    const projects = [];
    for (const e of entries) {
        if (e.isDirectory()) {
            const envPath = path.join(RESOURCES_PATH, e.name, ".env");
            if (fs.existsSync(envPath))
                projects.push(e.name);
        }
    }
    return projects;
}
function parseEnv(name) {
    const envPath = path.join(RESOURCES_PATH, name, ".env");
    const out = {};
    if (!fs.existsSync(envPath))
        return out;
    const text = fs.readFileSync(envPath, "utf8");
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith("#"))
            continue;
        const idx = line.indexOf("=");
        if (idx === -1)
            continue;
        const key = line.slice(0, idx).trim();
        let val = line.slice(idx + 1).trim();
        val = val.replace(/^["']|["']$/g, "");
        out[key] = val;
    }
    return out;
}
function getLogDir(name) {
    const env = parseEnv(name);
    const tomcatHome = env.TOMCAT_HOME || "";
    let catBase = env.CATALINA_BASE;
    if (!catBase)
        catBase = path.join(tomcatHome, name);
    return path.join(catBase, "logs");
}
function stopTail() {
    if (tailTimer) {
        clearInterval(tailTimer);
        tailTimer = null;
    }
}
function startTail(name) {
    stopTail();
    const logDir = getLogDir(name);
    let lastFile = null;
    let lastPos = 0;
    tailTimer = setInterval(() => {
        if (!fs.existsSync(logDir))
            return;
        let files;
        try {
            files = fs.readdirSync(logDir).filter((f) => /\.log$/.test(f) && !/access_log/.test(f));
        }
        catch (e) {
            return;
        }
        if (files.length === 0)
            return;
        let best = null;
        let bestMtime = -1;
        let bestIsCatalina = false;
        for (const f of files) {
            const st = fs.statSync(path.join(logDir, f));
            const isCat = /catalina/.test(f);
            const better = (best === null) ||
                (isCat !== bestIsCatalina ? isCat : st.mtimeMs > bestMtime);
            if (better) {
                best = f;
                bestMtime = st.mtimeMs;
                bestIsCatalina = isCat;
            }
        }
        if (!best)
            return;
        const full = path.join(logDir, best);
        if (full !== lastFile) {
            lastFile = full;
            lastPos = fs.existsSync(full) ? fs.statSync(full).size : 0;
        }
        const st = fs.statSync(full);
        if (st.size < lastPos)
            lastPos = 0;
        if (st.size > lastPos) {
            try {
                const fd = fs.openSync(full, "r");
                const buf = Buffer.alloc(st.size - lastPos);
                fs.readSync(fd, buf, 0, buf.length, lastPos);
                fs.closeSync(fd);
                lastPos = st.size;
                sendConsole("[CATALINA] " + buf.toString("utf8"));
            }
            catch (e) {
            }
        }
    }, 1000);
}
function startProject(name, debugPort) {
    if (isRunning) {
        sendStatus("Ya hay un arranque en curso.");
        return;
    }
    isRunning = true;
    startedProject = name;
    setAppRunning(true);
    sendStatus("Arrancando " + name + "...");
    sendConsole("\n=== Iniciando " + name + " (" + new Date().toLocaleString() + ") ===\n");
    const spawnArgs = ["-ExecutionPolicy", "Bypass", "-File", path.join(SCRIPT_DIR, "scripts", "start-app.ps1"), name];
    if (debugPort) {
        spawnArgs.push(String(debugPort));
        sendConsole("[DEBUG] Modo depuracion JDWP en el puerto " + debugPort + ". Conecta VS Code (Attach) a localhost:" + debugPort + "\n");
    }
    const ps = (0, child_process_1.spawn)("powershell.exe", spawnArgs, { windowsHide: false });
    runningProc = ps;
    ps.stdout.on("data", (d) => sendConsole(stripAnsi(d.toString())));
    ps.stderr.on("data", (d) => sendConsole(stripAnsi(d.toString())));
    ps.on("close", (code) => {
        sendStatus("Script finalizado (codigo " + code + "). Tomcat sigue en segundo plano.");
        sendConsole("\n=== scripts/start-app.ps1 finalizado (codigo " + code + ") ===\n");
        runningProc = null;
        isRunning = false;
    });
    ps.on("error", (err) => {
        sendConsole("ERROR al lanzar el script: " + err.message + "\n");
        isRunning = false;
        runningProc = null;
        setAppRunning(false);
    });
    setTimeout(() => startTail(name), 3000);
}
function killRunningTree() {
    if (runningProc && runningProc.pid) {
        try {
            (0, child_process_1.execSync)("taskkill /T /F /PID " + runningProc.pid, { windowsHide: true, stdio: "ignore" });
        }
        catch (e) { }
        try {
            runningProc.kill();
        }
        catch (e) { }
        runningProc = null;
        isRunning = false;
    }
}
function stopProject(name) {
    sendStatus("Deteniendo " + name + "...");
    sendConsole("\n=== Deteniendo " + name + " (" + new Date().toLocaleString() + ") ===\n");
    killRunningTree();
    setAppRunning(false);
    const ps = (0, child_process_1.spawn)("powershell.exe", ["-ExecutionPolicy", "Bypass", "-File", path.join(SCRIPT_DIR, "scripts", "stop-app.ps1"), name], { windowsHide: false });
    ps.stdout.on("data", (d) => sendConsole(stripAnsi(d.toString())));
    ps.stderr.on("data", (d) => sendConsole(stripAnsi(d.toString())));
    ps.on("close", () => {
        sendStatus(name + " detenido.");
        stopTail();
        setAppRunning(false);
        if (startedProject === name)
            startedProject = null;
    });
}
function stopRunningDetached() {
    if (!startedProject)
        return;
    const name = startedProject;
    startedProject = null;
    setAppRunning(false);
    killRunningTree();
    try {
        const ps = (0, child_process_1.spawn)("powershell.exe", ["-ExecutionPolicy", "Bypass", "-File", path.join(SCRIPT_DIR, "scripts", "stop-app.ps1"), name], { windowsHide: true, detached: true, stdio: "ignore" });
        ps.unref();
        sendConsole("\n=== Cierre de la app: deteniendo " + name + " ===\n");
    }
    catch (e) {
    }
}
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1000,
        height: 720,
        icon: ICON_PATH,
        frame: false,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    mainWindow.loadFile(path.join(__dirname, "index.html"));
    electron_1.Menu.setApplicationMenu(null);
    mainWindow.webContents.on("before-input-event", (event, input) => {
        if (input.type !== "keyDown" || input.isAutoRepeat)
            return;
        if (!input.control || input.alt || input.meta)
            return;
        const combo = (input.shift ? "ctrl+shift+" : "ctrl+") + input.key.toLowerCase();
        const action = SHORTCUTS[combo];
        if (!action)
            return;
        event.preventDefault();
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("shortcut", action);
        }
    });
    mainWindow.on("maximize", () => {
        if (mainWindow && !mainWindow.isDestroyed())
            mainWindow.webContents.send("window-maximized", true);
    });
    mainWindow.on("unmaximize", () => {
        if (mainWindow && !mainWindow.isDestroyed())
            mainWindow.webContents.send("window-maximized", false);
    });
    mainWindow.on("close", () => {
        stopRunningDetached();
    });
    mainWindow.on("closed", () => {
        stopModalTail();
        stopTail();
        if (runningProc) {
            try {
                runningProc.kill();
            }
            catch (e) { }
            runningProc = null;
        }
        mainWindow = null;
    });
}
electron_1.ipcMain.handle("get-projects", () => listProjects());
electron_1.ipcMain.handle("add-project", (event, payload) => {
    const { name, javaHome, tomcatHome, dockerCompose, dockerWaitPort, startDocker } = payload || {};
    if (!name || typeof name !== "string")
        return { ok: false, error: "Nombre vacío" };
    const clean = name.trim();
    if (!/^[\w.-]+$/.test(clean)) {
        return { ok: false, error: "Nombre no válido (usa letras, números, ., _ o -)" };
    }
    const projectDir = path.join(RESOURCES_PATH, clean);
    const envPath = path.join(projectDir, ".env");
    if (fs.existsSync(projectDir)) {
        return { ok: false, error: "Ya existe un proyecto con ese nombre" };
    }
    const templatePath = path.join(__dirname, "docs", ".env.ejemplo");
    if (!fs.existsSync(templatePath)) {
        return { ok: false, error: "No se encuentra docs/.env.ejemplo" };
    }
    try {
        const template = fs.readFileSync(templatePath, "utf8");
        let envContent = template
            .replace(/<nombre_proyecto>/g, clean)
            .replace(/<NOMBRE>/g, clean.toUpperCase());
        if (javaHome) {
            envContent = envContent.replace(/^JAVA_HOME=.*$/m, "JAVA_HOME=" + javaHome);
        }
        if (tomcatHome) {
            envContent = envContent.replace(/^TOMCAT_HOME=.*$/m, "TOMCAT_HOME=" + tomcatHome);
        }
        let composePath = dockerCompose ? String(dockerCompose).trim() : "";
        if (composePath) {
            const isDir = fs.existsSync(composePath) && fs.statSync(composePath).isDirectory();
            if (isDir) {
                const found = ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"]
                    .map((n) => path.join(composePath, n))
                    .find((p) => fs.existsSync(p));
                if (!found)
                    return { ok: false, error: "La carpeta no contiene ningun compose (docker-compose.yml)" };
                composePath = found;
            }
            envContent = envContent.replace(/\s+$/, "") + "\r\n\r\n# --- Servicios Docker ---\r\nSTART_DOCKER=true";
            envContent += "\r\nDOCKER_COMPOSE_FILE=" + composePath;
            if (dockerWaitPort)
                envContent += "\r\nDOCKER_WAIT_PORT=" + String(dockerWaitPort).trim();
            envContent += "\r\n";
        }
        fs.mkdirSync(projectDir, { recursive: true });
        fs.writeFileSync(envPath, envContent, "utf8");
    }
    catch (e) {
        return { ok: false, error: e.message };
    }
    return { ok: true, name: clean };
});
electron_1.ipcMain.handle("scan-java", async () => {
    const bases = [
        "C:\\Program Files\\Java",
        "C:\\Program Files\\Eclipse Adoptium",
        "C:\\Program Files\\Amazon Corretto",
        "C:\\Program Files\\Microsoft",
        "C:\\Program Files\\RedHat",
        "C:\\Program Files\\Zulu",
        "C:\\Program Files\\BellSoft",
        "C:\\Program Files\\SapMachine",
    ];
    const results = [];
    for (const base of bases) {
        if (!fs.existsSync(base))
            continue;
        try {
            const dirs = await fs.promises.readdir(base, { withFileTypes: true });
            for (const d of dirs) {
                if (d.isDirectory()) {
                    const full = path.join(base, d.name);
                    const hasJava = await fs.promises.access(path.join(full, "bin", "java.exe")).then(() => true, () => false);
                    results.push({ name: d.name, path: full, hasJava });
                }
            }
        }
        catch (e) { }
    }
    results.sort((a, b) => a.name.localeCompare(b.name));
    return results;
});
electron_1.ipcMain.handle("scan-tomcat", async () => {
    const base = "C:\\Program Files\\Apache Software Foundation";
    const results = [];
    if (!fs.existsSync(base))
        return results;
    try {
        const dirs = await fs.promises.readdir(base, { withFileTypes: true });
        for (const d of dirs) {
            if (d.isDirectory() && d.name.toLowerCase().startsWith("tomcat")) {
                const full = path.join(base, d.name);
                results.push({ name: d.name, path: full });
            }
        }
    }
    catch (e) { }
    results.sort((a, b) => a.name.localeCompare(b.name));
    return results;
});
electron_1.ipcMain.handle("get-app-url", (event, name) => {
    const env = parseEnv(name);
    const port = env.TOMCAT_PORT || "8080";
    const ctx = env.CONTEXT_PATH || name;
    const url = `http://localhost:${port}/${ctx}/`;
    return {
        url: url,
        projectDir: env.PROJECT_DIR || "",
    };
});
electron_1.ipcMain.on("open-url", (event, url) => {
    try {
        electron_1.shell.openExternal(url);
    }
    catch (e) { }
});
function stopModalTail() {
    if (modalTail) {
        clearInterval(modalTail);
        modalTail = null;
    }
}
electron_1.ipcMain.handle("get-logs-info", (event, name) => {
    const env = parseEnv(name);
    const tomcatHome = env.TOMCAT_HOME || "";
    let catBase = env.CATALINA_BASE;
    if (!catBase)
        catBase = path.join(tomcatHome, name);
    const tomcatLogs = path.join(catBase, "logs");
    const appsBase = env.APPS_BASE_PATH || "C:\\apps_env";
    const appLogsDir = env.APPS_LOG_PATH || path.join(appsBase, "logs");
    const appLogs = path.join(appLogsDir, name);
    const listLogs = (dir) => {
        if (!fs.existsSync(dir))
            return [];
        return fs.readdirSync(dir)
            .filter((f) => /\.log$/i.test(f) || /\.txt$/i.test(f))
            .sort();
    };
    return {
        tomcat: { dir: tomcatLogs, files: listLogs(tomcatLogs) },
        app: { dir: appLogs, files: listLogs(appLogs) },
    };
});
electron_1.ipcMain.on("log-open", (event, payload) => {
    stopModalTail();
    const name = payload && payload.name;
    const file = payload && payload.file;
    const loc = payload && payload.loc;
    if (!name || !file)
        return;
    const env = parseEnv(name);
    const tomcatHome = env.TOMCAT_HOME || "";
    let catBase = env.CATALINA_BASE;
    if (!catBase)
        catBase = path.join(tomcatHome, name);
    const appsBase = env.APPS_BASE_PATH || "C:\\apps_env";
    const appLogsDir = env.APPS_LOG_PATH || path.join(appsBase, "logs");
    const full = loc === "app"
        ? path.join(appLogsDir, name, file)
        : path.join(catBase, "logs", file);
    let lastPos = 0;
    if (fs.existsSync(full)) {
        const size = fs.statSync(full).size;
        const start = Math.max(0, size - 200000);
        try {
            const fd0 = fs.openSync(full, "r");
            const buf0 = Buffer.alloc(size - start);
            fs.readSync(fd0, buf0, 0, buf0.length, start);
            fs.closeSync(fd0);
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send("log-chunk", buf0.toString("utf8"));
            }
        }
        catch (e) { }
        lastPos = size;
    }
    modalTail = setInterval(() => {
        if (!fs.existsSync(full))
            return;
        const st = fs.statSync(full);
        if (st.size < lastPos)
            lastPos = 0;
        if (st.size > lastPos) {
            try {
                const fd = fs.openSync(full, "r");
                const buf = Buffer.alloc(st.size - lastPos);
                fs.readSync(fd, buf, 0, buf.length, lastPos);
                fs.closeSync(fd);
                lastPos = st.size;
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send("log-chunk", buf.toString("utf8"));
                }
            }
            catch (e) { }
        }
    }, 1000);
});
electron_1.ipcMain.on("log-close", () => stopModalTail());
const CONFIG_CATALOG = {
    CONTEXT_PATH: { description: "Contexto de despliegue de la aplicación", kind: "string", required: true, common: true },
    PROJECT_DIR: { description: "Ruta del proyecto fuente", kind: "path", required: true, common: true },
    PROJECT_DIR_FRONTEND: { description: "Ruta del proyecto frontend (opcional)", kind: "path", required: false, common: true },
    WAR_MODULE_DIR: { description: "Nombre del módulo WAR del proyecto", kind: "string", required: true, common: true },
    APPS_ENV: { description: "Entorno de despliegue", kind: "string", required: true, common: true },
    APPS_BASE_PATH: { description: "Ruta base para instalaciones de entornos", kind: "path", required: true, common: true },
    TOMCAT_HOME: { description: "Ruta de instalación de Tomcat", kind: "path", required: true, common: true },
    TOMCAT_PORT: { description: "Puerto HTTP de Tomcat", kind: "string", required: true, common: true },
    JAVA_HOME: { description: "Ruta del JDK a utilizar", kind: "path", required: true, common: true },
    HEALTH_CHECK_URL: { description: "URL de comprobación de salud", kind: "string", required: false, common: true },
    JNDI_NAME: { description: "Nombre del recurso JNDI de base de datos", kind: "string", required: false, common: true },
    DB_URL_PROPERTY: { description: "Propiedad del fichero (URL)", kind: "string", required: false, common: true, db: "property" },
    DB_URL_REGVAR: { description: "Variable de registro Windows (URL)", kind: "string", required: false, common: true, db: "registry" },
    DB_USERNAME_PROPERTY: { description: "Propiedad del fichero (usuario)", kind: "string", required: false, common: true, db: "property" },
    DB_USERNAME_REGVAR: { description: "Variable de registro Windows (usuario)", kind: "string", required: false, common: true, db: "registry" },
    DB_PASSWORD_PROPERTY: { description: "Propiedad del fichero (contraseña)", kind: "string", required: false, common: true, db: "property" },
    DB_PASSWORD_REGVAR: { description: "Variable de registro Windows (contraseña)", kind: "string", required: false, common: true, db: "registry" },
    DEBUG_PORT: { description: "Puerto JDWP para depuración", kind: "string", required: false, common: true },
    EXTRA_JVM_ARGS: { description: "Argumentos extra para la JVM", kind: "string", required: false, common: false },
    ENCRYPT_KEY: { description: "Clave de cifrado para propiedades sensibles", kind: "string", required: false, common: false },
    SKIP_BUILD: { description: "Omitir la construcción del WAR si ya existe", kind: "bool", required: false, common: false },
    TEST_DIR: { description: "Ruta personalizada del directorio de tests", kind: "path", required: false, common: false },
    START_DOCKER: { description: "Arrancar servicios Docker", kind: "bool", required: false, common: false, group: "docker" },
    DOCKER_COMPOSE_FILE: { description: "Fichero compose a arrancar (vacío: se detecta solo)", kind: "path", required: false, common: false, group: "docker" },
    DOCKER_WAIT_PORT: { description: "Puerto que debe escuchar antes de arrancar Tomcat", kind: "string", required: false, common: false, group: "docker" },
    DOCKER_HEALTH_URL: { description: "URL de salud de los servicios Docker", kind: "string", required: false, common: false, group: "docker" },
    DOCKER_WAIT_TIMEOUT: { description: "Segundos de espera de los servicios Docker", kind: "string", required: false, common: false, group: "docker" },
};
function inferConfigMeta(key) {
    if (CONFIG_CATALOG[key])
        return CONFIG_CATALOG[key];
    const lower = key.toLowerCase();
    const isBool = /^(skip|enable|use|disable|allow)_/.test(lower);
    const isPath = /_(path|dir|home)$/.test(lower) || lower.includes("path") || lower.includes("dir") || lower.includes("home");
    return { description: "", kind: isBool ? "bool" : isPath ? "path" : "string", required: false, common: false };
}
function getConfigEntries(name) {
    const envPath = path.join(RESOURCES_PATH, name, ".env");
    const out = [];
    if (!fs.existsSync(envPath))
        return out;
    const text = fs.readFileSync(envPath, "utf8");
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (line === "" || line.startsWith("#") || raw.indexOf("=") === -1) {
            out.push({ type: "other", text: raw });
            continue;
        }
        const idx = raw.indexOf("=");
        const key = raw.slice(0, idx).trim();
        const value = raw.slice(idx + 1);
        if (key === "") {
            out.push({ type: "other", text: raw });
            continue;
        }
        const meta = inferConfigMeta(key);
        out.push({ type: "kv", key: key, value: value, ...meta });
    }
    return out;
}
electron_1.ipcMain.handle("get-config", (event, name) => {
    return { path: path.join(RESOURCES_PATH, name, ".env"), entries: getConfigEntries(name) };
});
electron_1.ipcMain.handle("save-config", (event, payload) => {
    const name = payload && payload.name;
    const entries = payload && payload.entries;
    if (!name || !Array.isArray(entries))
        return { ok: false };
    const envPath = path.join(RESOURCES_PATH, name, ".env");
    const lines = [];
    for (const e of entries) {
        if (e.type === "kv") {
            if (!e.key || e.key.trim() === "")
                continue;
            lines.push(e.key.trim() + "=" + (e.value !== undefined ? e.value : ""));
        }
        else {
            lines.push(e.text !== undefined ? e.text : "");
        }
    }
    fs.writeFileSync(envPath, lines.join("\r\n") + "\r\n", "utf8");
    return { ok: true };
});
electron_1.ipcMain.on("start", (event, name) => startProject(name));
electron_1.ipcMain.on("debug", (event, name) => startDebug(name));
electron_1.ipcMain.on("stop", (event, name) => stopProject(name));
electron_1.ipcMain.on("open-vscode", (event, name) => openProjectInVsCode(name));
function openProjectInVsCode(name) {
    const env = parseEnv(name);
    const dirs = [];
    if (env.PROJECT_DIR)
        dirs.push(env.PROJECT_DIR);
    if (env.PROJECT_DIR_FRONTEND)
        dirs.push(env.PROJECT_DIR_FRONTEND);
    const existing = [...new Set(dirs.filter((d) => fs.existsSync(d)))];
    for (const d of existing)
        openDirInVsCode(d);
}
function openDirInVsCode(dir) {
    const uri = "vscode://file/" + dir.replace(/\\/g, "/");
    (0, child_process_1.exec)('code --new-window "' + dir.replace(/"/g, "") + '"', { windowsHide: true }, (err) => {
        if (err) {
            try {
                electron_1.shell.openExternal(uri);
            }
            catch (e) { }
        }
    });
}
function startDebug(name) {
    if (!name)
        return;
    const env = parseEnv(name);
    const port = env.DEBUG_PORT || "8000";
    const projectDir = env.PROJECT_DIR;
    if (projectDir) {
        try {
            const vscodeDir = path.join(projectDir, ".vscode");
            const launchPath = path.join(vscodeDir, "launch.json");
            if (!fs.existsSync(launchPath)) {
                fs.mkdirSync(vscodeDir, { recursive: true });
                const cfg = {
                    version: "0.2.0",
                    configurations: [
                        {
                            type: "java",
                            name: "Attach " + name + " (Tomcat " + port + ")",
                            request: "attach",
                            hostName: "localhost",
                            port: parseInt(port, 10),
                        },
                    ],
                };
                fs.writeFileSync(launchPath, JSON.stringify(cfg, null, 2), "utf8");
            }
        }
        catch (e) { }
    }
    openProjectInVsCode(name);
    startProject(name, port);
}
function findJavaFiles(dir) {
    const out = [];
    if (!fs.existsSync(dir))
        return out;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
            out.push(...findJavaFiles(full));
        }
        else if (e.isFile() && e.name.endsWith(".java")) {
            out.push(full);
        }
    }
    return out;
}
function extractPackage(text) {
    const m = text.match(/package\s+([a-zA-Z0-9_.]+)\s*;/);
    return m ? m[1] : "";
}
function extractExtends(text) {
    const m = text.match(/class\s+\w+\s+extends\s+([A-Za-z_]\w*)/);
    return m ? m[1] : null;
}
function buildClassFileMap(projectDir) {
    const map = new Map();
    const skipDirs = new Set(["target", "node_modules", ".git", "dist", "build"]);
    function scan(dir) {
        if (!fs.existsSync(dir))
            return;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
            const full = path.join(dir, e.name);
            if (e.isDirectory()) {
                if (!skipDirs.has(e.name))
                    scan(full);
            }
            else if (e.isFile() && e.name.endsWith(".java")) {
                const simple = e.name.replace(".java", "");
                const arr = map.get(simple) || [];
                arr.push(full);
                map.set(simple, arr);
            }
        }
    }
    scan(projectDir);
    return map;
}
function resolveBaseClassFile(baseName, fileText, projectDir, classMap) {
    const importRegex = new RegExp(`import\\s+(?:static\\s+)?([A-Za-z_][\\w.]*\\.${baseName})\\s*;`);
    const m = fileText.match(importRegex);
    if (m) {
        const full = m[1];
        const relative = full.replace(/\./g, "\\") + ".java";
        const candidates = [
            path.join(projectDir, "src", "test", "java", relative),
            path.join(projectDir, "src", "main", "java", relative),
        ];
        for (const c of candidates) {
            if (fs.existsSync(c))
                return c;
        }
    }
    const pkg = extractPackage(fileText);
    if (pkg) {
        const candidates = [
            path.join(projectDir, "src", "test", "java", pkg.replace(/\./g, "\\"), baseName + ".java"),
            path.join(projectDir, "src", "main", "java", pkg.replace(/\./g, "\\"), baseName + ".java"),
        ];
        for (const c of candidates) {
            if (fs.existsSync(c))
                return c;
        }
    }
    const files = classMap.get(baseName);
    if (files && files.length > 0)
        return files[0];
    return null;
}
function collectTestMethods(file, projectDir, classMap, visited) {
    if (visited.has(file))
        return [];
    visited.add(file);
    const text = fs.readFileSync(file, "utf8");
    const ownMethods = extractTestMethods(text);
    const baseName = extractExtends(text);
    if (!baseName)
        return ownMethods;
    const baseFile = resolveBaseClassFile(baseName, text, projectDir, classMap);
    if (!baseFile)
        return ownMethods;
    const inherited = collectTestMethods(baseFile, projectDir, classMap, visited);
    return [...new Set([...ownMethods, ...inherited])];
}
function extractTestMethods(text) {
    const methods = [];
    const lines = text.split(/\r?\n/);
    const testAnnotationRegex = /@(?:Test|ParameterizedTest|RepeatedTest|TestFactory|TestTemplate|org\.junit\.jupiter\.api\.(?:Test|ParameterizedTest|RepeatedTest|TestFactory|TestTemplate)|org\.junit\.Test|org\.testng\.annotations\.Test)\b/;
    const methodSignatureRegex = /^(?:public|protected|private)?\s*(?:static\s+)?(?:final\s+)?(?:synchronized\s+)?[\w<>\[\],\s.]+?\s+(\w+)\s*(?:\(|$)/;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const code = line.replace(/\/\/.*$/, "").trim();
        if (!testAnnotationRegex.test(code))
            continue;
        let inBlockComment = false;
        let signatureStarted = false;
        for (let j = i + 1; j < lines.length; j++) {
            let next = lines[j].trim();
            if (!next)
                continue;
            if (inBlockComment) {
                if (next.includes("*/"))
                    inBlockComment = false;
                continue;
            }
            while (next.startsWith("/*")) {
                const endIdx = next.indexOf("*/");
                if (endIdx === -1) {
                    inBlockComment = true;
                    next = "";
                }
                else {
                    next = next.substring(endIdx + 2).trim();
                }
                if (!next)
                    break;
            }
            if (!next)
                continue;
            if (inBlockComment) {
                if (next.includes("*/"))
                    inBlockComment = false;
                continue;
            }
            if (next.startsWith("//"))
                continue;
            if (!signatureStarted && next.startsWith("@"))
                continue;
            const methodMatch = next.match(methodSignatureRegex);
            if (methodMatch) {
                methods.push(methodMatch[1]);
            }
            break;
        }
    }
    return methods;
}
function getTestDir(name) {
    const env = parseEnv(name);
    const projectDir = env.PROJECT_DIR;
    if (!projectDir)
        return "";
    if (env.TEST_DIR)
        return env.TEST_DIR;
    const warName = env.WAR_MODULE_DIR || (path.basename(projectDir) + "-war");
    return path.join(projectDir, warName, "src", "test");
}
function findAllTestDirs(projectDir) {
    const dirs = [];
    const skipDirs = new Set(["target", "node_modules", ".git", "dist", "build"]);
    function scan(dir) {
        if (!fs.existsSync(dir))
            return;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
            if (!e.isDirectory())
                continue;
            if (skipDirs.has(e.name))
                continue;
            const full = path.join(dir, e.name);
            if (e.name === "test" && path.basename(dir) === "src") {
                dirs.push(full);
            }
            else {
                scan(full);
            }
        }
    }
    scan(projectDir);
    return dirs;
}
function discoverTests(name) {
    const env = parseEnv(name);
    const projectDir = env.PROJECT_DIR;
    if (!projectDir)
        return [];
    const testDirs = env.TEST_DIR ? [env.TEST_DIR] : findAllTestDirs(projectDir);
    const root = [];
    const debug = [];
    for (const testDir of testDirs) {
        if (!fs.existsSync(testDir))
            continue;
        const files = findJavaFiles(testDir);
        for (const file of files) {
            const text = fs.readFileSync(file, "utf8");
            const methods = extractTestMethods(text);
            const pkg = extractPackage(text);
            const fileName = path.basename(file, ".java");
            const className = pkg ? `${pkg}.${fileName}` : fileName;
            debug.push({ file, className, methods: [...methods] });
            if (methods.length === 0)
                continue;
            const children = methods
                .sort((a, b) => a.localeCompare(b))
                .map((m) => ({
                id: `${className}#${m}`,
                name: m,
                type: "method",
                status: "none",
                className,
            }));
            root.push({
                id: className,
                name: fileName,
                type: "class",
                status: "none",
                className,
                children,
            });
        }
    }
    try {
        const debugPath = path.join(projectDir, ".test-discovery-debug.json");
        const allTestIds = root
            .flatMap((c) => (c.children || []).map((m) => `${c.className}#${m.name}`))
            .sort();
        fs.writeFileSync(debugPath, JSON.stringify({
            projectDir,
            testDirs,
            totalClasses: root.length,
            totalMethods: allTestIds.length,
            allTestIds,
            files: debug.sort((a, b) => a.className.localeCompare(b.className)),
        }, null, 2), "utf8");
        sendConsole(`[TEST-DISCOVER] Debug escrito en: ${debugPath}\n`);
    }
    catch (e) { }
    return root.sort((a, b) => a.name.localeCompare(b.name));
}
function findSurefireReports(projectDir, depth = 3) {
    const out = [];
    if (!projectDir || !fs.existsSync(projectDir) || depth <= 0)
        return out;
    function scan(dir, level) {
        if (level <= 0 || !fs.existsSync(dir))
            return;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
            if (!e.isDirectory())
                continue;
            const full = path.join(dir, e.name);
            if (e.name === "surefire-reports") {
                const files = fs.readdirSync(full)
                    .filter((f) => f.startsWith("TEST-") && f.endsWith(".xml"))
                    .map((f) => path.join(full, f));
                sendConsole(`[SUREFIRE-SCAN] ${full} -> ${files.length} archivos\n`);
                out.push(...files);
            }
            else if (e.name !== "node_modules") {
                scan(full, level - 1);
            }
        }
    }
    scan(projectDir, depth);
    return out;
}
function parseTestCaseAttrs(attrs) {
    const nameMatch = attrs.match(/\sname="([^"]+)"/);
    const classMatch = attrs.match(/\sclassname="([^"]+)"/);
    const timeMatch = attrs.match(/\stime="([^"]+)"/);
    if (!nameMatch)
        return null;
    return {
        name: nameMatch[1],
        classname: classMatch ? classMatch[1] : "",
        duration: timeMatch ? parseFloat(timeMatch[1]) : 0,
    };
}
function parseTestCaseBlock(block) {
    const timeMatch = block.match(/\stime="([^"]+)"/);
    const time = timeMatch ? parseFloat(timeMatch[1]) : 0;
    let status = "pass";
    let error = "";
    if (block.includes("<failure")) {
        status = "fail";
        error = extractXmlContent(block, "failure");
    }
    else if (block.includes("<error")) {
        status = "fail";
        error = extractXmlContent(block, "error");
    }
    else if (block.includes("<skipped")) {
        status = "skip";
    }
    return { status, duration: Math.round(time * 1000), error };
}
function parseSurefireXml(text) {
    const classMatch = text.match(/<testsuite[^>]*\sname="([^"]+)"/);
    const className = classMatch ? classMatch[1] : "";
    if (!className)
        return null;
    const results = [];
    const selfClosingRegex = /<testcase([^>]+)\/>/g;
    let m;
    while ((m = selfClosingRegex.exec(text)) !== null) {
        const attrs = parseTestCaseAttrs(m[1]);
        if (!attrs)
            continue;
        const meta = parseTestCaseBlock(m[0]);
        results.push({ id: `${attrs.classname || className}#${attrs.name}`, method: attrs.name, ...meta });
    }
    const blockRegex = /<testcase([^>]+)>[\s\S]*?<\/testcase>/g;
    while ((m = blockRegex.exec(text)) !== null) {
        const attrs = parseTestCaseAttrs(m[1]);
        if (!attrs)
            continue;
        const meta = parseTestCaseBlock(m[0]);
        results.push({ id: `${attrs.classname || className}#${attrs.name}`, method: attrs.name, ...meta });
    }
    return { className, results };
}
function parseSurefireReports(projectDir) {
    const map = new Map();
    const files = findSurefireReports(projectDir);
    sendConsole(`[SUREFIRE-PARSE] ${files.length} archivos XML encontrados\n`);
    if (files.length === 0)
        return map;
    for (const file of files) {
        sendConsole(`[SUREFIRE-PARSE] Leyendo ${path.basename(file)}\n`);
        const text = fs.readFileSync(file, "utf8");
        const parsed = parseSurefireXml(text);
        if (!parsed) {
            sendConsole(`[SUREFIRE-PARSE] No se pudo parsear ${path.basename(file)}\n`);
            continue;
        }
        sendConsole(`[SUREFIRE-PARSE] ${parsed.results.length} resultados en ${parsed.className}\n`);
        for (const r of parsed.results) {
            map.set(r.id, { status: r.status, duration: r.duration, error: r.error });
        }
    }
    return map;
}
function extractXmlContent(block, tag) {
    const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`);
    const m = block.match(regex);
    return m ? m[1].replace(/<\/?[^>]+>/g, " ").trim() : "";
}
function aggregateClassStatus(node) {
    if (!node.children || node.children.length === 0)
        return;
    for (const child of node.children)
        aggregateClassStatus(child);
    if (node.children.some((c) => c.status === "fail"))
        node.status = "fail";
    else if (node.children.some((c) => c.status === "skip"))
        node.status = "skip";
    else if (node.children.every((c) => c.status === "pass"))
        node.status = "pass";
    else
        node.status = "none";
}
electron_1.ipcMain.handle("discover-tests", (event, name) => {
    const tests = discoverTests(name);
    const env = parseEnv(name);
    let resultCount = 0;
    let appliedCount = 0;
    if (env.PROJECT_DIR) {
        const results = parseSurefireReports(env.PROJECT_DIR);
        resultCount = results.size;
        for (const cls of tests) {
            for (const method of cls.children || []) {
                const res = results.get(method.id);
                if (res) {
                    method.status = res.status || "none";
                    method.duration = res.duration;
                    method.error = res.error;
                    appliedCount++;
                }
            }
            aggregateClassStatus(cls);
        }
    }
    const methodCount = tests.reduce((sum, cls) => sum + (cls.children ? cls.children.length : 0), 0);
    sendConsole(`[TEST-DISCOVER] ${tests.length} clases, ${methodCount} metodos, ${resultCount} resultados surefire, ${appliedCount} aplicados\n`);
    return { tests, testDir: getTestDir(name) };
});
electron_1.ipcMain.handle("set-test-dir", (event, payload) => {
    const name = payload && payload.name;
    const dir = payload && payload.dir;
    if (!name)
        return;
    const envPath = path.join(RESOURCES_PATH, name, ".env");
    if (!fs.existsSync(envPath))
        return;
    let text = fs.readFileSync(envPath, "utf8");
    const line = `TEST_DIR=${dir}`;
    if (/^TEST_DIR=/m.test(text)) {
        text = text.replace(/^TEST_DIR=.*$/m, line);
    }
    else {
        text = text.trimEnd() + "\r\n" + line + "\r\n";
    }
    fs.writeFileSync(envPath, text, "utf8");
});
electron_1.ipcMain.handle("run-tests", async (event, payload) => {
    const { name, ids, all } = payload;
    const env = parseEnv(name);
    const projectDir = env.PROJECT_DIR;
    if (!projectDir || !fs.existsSync(projectDir))
        return { ok: false, error: "Proyecto no encontrado" };
    const pomPath = path.join(projectDir, "pom.xml");
    let testArg = "";
    if (all || ids.length === 0) {
        sendConsole(`\n=== Ejecutando todos los tests ===\n`);
    }
    else {
        const selectors = ids.filter((id) => id.includes("#"));
        testArg = selectors.join(",");
        sendConsole(`\n=== Ejecutando ${selectors.length} tests ===\n`);
    }
    return new Promise((resolve) => {
        if (testProc) {
            try {
                testProc.kill();
            }
            catch (e) { }
        }
        const testFilter = testArg ? `'-Dtest=${testArg}' ` : "";
        const ps = (0, child_process_1.spawn)("powershell.exe", [
            "-ExecutionPolicy", "Bypass",
            "-Command",
            `& mvn test ${testFilter}'-DfailIfNoTests=false' -f '${pomPath}'`,
        ], { windowsHide: false, cwd: projectDir });
        testProc = ps;
        let currentClass = "";
        let outputBuffer = "";
        function processLine(line) {
            const runningMatch = line.match(/Running ([\w.]+Test)\s*$/);
            if (runningMatch) {
                currentClass = runningMatch[1];
                sendConsole(`[TEST-STARTED] ${currentClass}\n`);
                sendTestProgress({ type: "started", className: currentClass });
                return;
            }
            const resultMatch = line.match(/Tests run:\s*(\d+),\s*Failures:\s*(\d+),\s*Errors:\s*(\d+),\s*Skipped:\s*(\d+)/);
            if (resultMatch && currentClass) {
                const [_, run, failures, errors, skipped] = resultMatch.map(Number);
                let status = "pass";
                if (failures > 0 || errors > 0)
                    status = "fail";
                else if (skipped > 0 && run === skipped)
                    status = "skip";
                const results = [];
                const reportFiles = findSurefireReports(projectDir);
                const reportFile = reportFiles.find((f) => f.endsWith(`TEST-${currentClass}.xml`));
                if (reportFile) {
                    try {
                        const text = fs.readFileSync(reportFile, "utf8");
                        const parsed = parseSurefireXml(text);
                        if (parsed) {
                            for (const r of parsed.results) {
                                results.push({ id: r.id, status: r.status, duration: r.duration, error: r.error });
                            }
                        }
                    }
                    catch (e) { }
                }
                sendConsole(`[TEST-FINISHED] ${currentClass} -> ${status}\n`);
                sendTestProgress({ type: "finished", className: currentClass, run, failures, errors, skipped, status, results });
                currentClass = "";
            }
        }
        function parseTestOutput(text) {
            outputBuffer += text;
            const lines = outputBuffer.split(/\r?\n/);
            outputBuffer = lines.pop() || "";
            for (const line of lines) {
                processLine(line.trim());
            }
        }
        ps.stdout.on("data", (d) => {
            const text = stripAnsi(d.toString());
            sendConsole(text);
            parseTestOutput(text);
        });
        ps.stderr.on("data", (d) => {
            const text = stripAnsi(d.toString());
            sendConsole(text);
            parseTestOutput(text);
        });
        ps.on("close", (code) => {
            testProc = null;
            sendConsole(`\n=== Tests finalizados (código ${code}) ===\n`);
            sendTestProgress({ type: "done" });
        });
        ps.on("error", (err) => {
            testProc = null;
            sendConsole("ERROR al ejecutar tests: " + err.message + "\n");
            sendTestProgress({ type: "done", error: err.message });
        });
        resolve({ ok: true });
    });
});
electron_1.ipcMain.on("stop-tests", () => {
    if (testProc && testProc.pid) {
        try {
            (0, child_process_1.execSync)("taskkill /T /F /PID " + testProc.pid, { windowsHide: true, stdio: "ignore" });
        }
        catch (e) { }
        try {
            testProc.kill();
        }
        catch (e) { }
        testProc = null;
        sendConsole("\n=== Ejecución de tests detenida por el usuario ===\n");
        sendTestProgress({ type: "done" });
    }
});
electron_1.ipcMain.handle("browse-path", async (event, currentPath) => {
    const defaultPath = currentPath || RESOURCES_PATH || "";
    const isDir = !path.extname(defaultPath);
    const properties = isDir ? ["openDirectory"] : ["openFile"];
    const defaultFilters = isDir ? undefined : [{ name: "Todos", extensions: ["*"] }];
    const res = await electron_1.dialog.showOpenDialog(mainWindow, {
        title: "Seleccionar ruta",
        defaultPath: defaultPath,
        properties: properties,
        filters: defaultFilters,
    });
    if (res.canceled || !res.filePaths[0])
        return { canceled: true };
    return { canceled: false, path: res.filePaths[0] };
});
electron_1.ipcMain.handle("browse-file", async (event, opts) => {
    const o = (opts || {});
    const exts = o.extensions && o.extensions.length ? o.extensions : ["*"];
    const res = await electron_1.dialog.showOpenDialog(mainWindow, {
        title: o.title || "Seleccionar fichero",
        defaultPath: o.currentPath || RESOURCES_PATH || "",
        properties: ["openFile"],
        filters: [{ name: "Fichero", extensions: exts }],
    });
    if (res.canceled || !res.filePaths[0])
        return { canceled: true };
    return { canceled: false, path: res.filePaths[0] };
});
electron_1.ipcMain.handle("get-resources-path", () => RESOURCES_PATH);
electron_1.ipcMain.handle("choose-resources-path", async () => {
    const res = await electron_1.dialog.showOpenDialog(mainWindow, {
        title: "Elige la carpeta base de proyectos (resources)",
        properties: ["openDirectory"],
    });
    if (res.canceled || !res.filePaths[0])
        return { ok: false, path: RESOURCES_PATH };
    RESOURCES_PATH = res.filePaths[0];
    saveResourcesPath(RESOURCES_PATH);
    return { ok: true, path: RESOURCES_PATH };
});
electron_1.ipcMain.on("clear-console", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("clear");
    }
});
electron_1.ipcMain.on("window-minimize", () => { if (mainWindow && !mainWindow.isDestroyed())
    mainWindow.minimize(); });
electron_1.ipcMain.on("window-toggle-maximize", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMaximized())
            mainWindow.unmaximize();
        else
            mainWindow.maximize();
    }
});
electron_1.ipcMain.on("window-close", () => { if (mainWindow && !mainWindow.isDestroyed())
    mainWindow.close(); });
electron_1.app.whenReady().then(async () => {
    createWindow();
    const ok = await ensureResourcesPath();
    if (!ok)
        return;
    if (mainWindow && !mainWindow.isDestroyed())
        mainWindow.webContents.send("settings-updated");
});
electron_1.app.on("window-all-closed", () => {
    stopTail();
    if (process.platform !== "darwin")
        electron_1.app.quit();
});
