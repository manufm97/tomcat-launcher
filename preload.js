"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld("api", {
    getProjects: () => electron_1.ipcRenderer.invoke("get-projects"),
    addProject: (payload) => electron_1.ipcRenderer.invoke("add-project", payload),
    scanJava: () => electron_1.ipcRenderer.invoke("scan-java"),
    scanTomcat: () => electron_1.ipcRenderer.invoke("scan-tomcat"),
    getAppUrl: (name) => electron_1.ipcRenderer.invoke("get-app-url", name),
    getLogsInfo: (name) => electron_1.ipcRenderer.invoke("get-logs-info", name),
    getConfig: (name) => electron_1.ipcRenderer.invoke("get-config", name),
    saveConfig: (payload) => electron_1.ipcRenderer.invoke("save-config", payload),
    start: (name) => electron_1.ipcRenderer.send("start", name),
    debug: (name) => electron_1.ipcRenderer.send("debug", name),
    stop: (name) => electron_1.ipcRenderer.send("stop", name),
    openVscode: (name) => electron_1.ipcRenderer.send("open-vscode", name),
    openUrl: (url) => electron_1.ipcRenderer.send("open-url", url),
    openLog: (payload) => electron_1.ipcRenderer.send("log-open", payload),
    closeLog: () => electron_1.ipcRenderer.send("log-close"),
    clear: () => electron_1.ipcRenderer.send("clear-console"),
    onConsole: (cb) => electron_1.ipcRenderer.on("console", (_e, text) => cb(text)),
    onStatus: (cb) => electron_1.ipcRenderer.on("status", (_e, text) => cb(text)),
    onClear: (cb) => electron_1.ipcRenderer.on("clear", () => cb()),
    onRunning: (cb) => electron_1.ipcRenderer.on("running", (_e, state) => cb(state)),
    onLogChunk: (cb) => electron_1.ipcRenderer.on("log-chunk", (_e, text) => cb(text)),
    windowMinimize: () => electron_1.ipcRenderer.send("window-minimize"),
    windowToggleMaximize: () => electron_1.ipcRenderer.send("window-toggle-maximize"),
    windowClose: () => electron_1.ipcRenderer.send("window-close"),
    onWindowMaximized: (cb) => electron_1.ipcRenderer.on("window-maximized", (_e, state) => cb(state)),
    getResourcesPath: () => electron_1.ipcRenderer.invoke("get-resources-path"),
    chooseResourcesPath: () => electron_1.ipcRenderer.invoke("choose-resources-path"),
    browsePath: (currentPath) => electron_1.ipcRenderer.invoke("browse-path", currentPath),
    browseFile: (opts) => electron_1.ipcRenderer.invoke("browse-file", opts),
    discoverTests: (name) => electron_1.ipcRenderer.invoke("discover-tests", name),
    runTests: (payload) => electron_1.ipcRenderer.invoke("run-tests", payload),
    stopTests: () => electron_1.ipcRenderer.send("stop-tests"),
    setTestDir: (payload) => electron_1.ipcRenderer.invoke("set-test-dir", payload),
    onTestProgress: (cb) => electron_1.ipcRenderer.on("test-progress", (_e, text) => {
        try {
            cb(JSON.parse(text));
        }
        catch (e) {
            cb({ type: "error", error: String(text) });
        }
    }),
    onSettingsUpdated: (cb) => electron_1.ipcRenderer.on("settings-updated", () => cb()),
});
