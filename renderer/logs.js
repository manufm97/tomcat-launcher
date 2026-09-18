const logModal = document.getElementById("logModal");
const logViewer = document.getElementById("logViewer");
const logFileSelect = document.getElementById("logFileSelect");
let currentName = "";
let logRaw = "";
let logDiv = null;
currentName = select.value;
function logAppend(text) {
    const atBottom = logViewer.scrollTop + logViewer.clientHeight >= logViewer.scrollHeight - 4;
    const parts = text.split("\n");
    if (logDiv === null) {
        logDiv = document.createElement("div");
        logDiv.className = "ln";
        logViewer.appendChild(logDiv);
    }
    logRaw += parts[0];
    logDiv.innerHTML = highlightLine(logRaw);
    for (let i = 1; i < parts.length; i++) {
        logRaw = parts[i];
        logDiv = document.createElement("div");
        logDiv.className = "ln";
        logDiv.innerHTML = highlightLine(logRaw);
        logViewer.appendChild(logDiv);
    }
    if (atBottom)
        logViewer.scrollTop = logViewer.scrollHeight;
}
window.api.onLogChunk((text) => logAppend(text));
function openLogFile() {
    const val = logFileSelect.value;
    if (!val || val === "__none__")
        return;
    const idx = val.indexOf("::");
    const loc = val.slice(0, idx);
    const file = val.slice(idx + 2);
    logViewer.textContent = "";
    logDiv = null;
    logRaw = "";
    window.api.openLog({ name: currentName, loc: loc, file: file });
}
async function openLogModal() {
    currentName = select.value;
    if (!currentName)
        return;
    const info = await window.api.getLogsInfo(currentName);
    logFileSelect.innerHTML = "";
    const none = document.createElement("option");
    none.value = "__none__";
    none.textContent = "(sin ficheros de log)";
    logFileSelect.appendChild(none);
    const fillGroup = (label, loc, files) => {
        if (!files || files.length === 0)
            return;
        const og = document.createElement("optgroup");
        og.label = label;
        const sorted = files.slice().sort((a, b) => {
            const ca = /catalina/.test(a) ? 0 : 1;
            const cb = /catalina/.test(b) ? 0 : 1;
            if (ca !== cb)
                return ca - cb;
            return b.localeCompare(a);
        });
        for (const f of sorted) {
            const opt = document.createElement("option");
            opt.value = loc + "::" + f;
            opt.textContent = f;
            og.appendChild(opt);
        }
        logFileSelect.appendChild(og);
    };
    fillGroup("Tomcat (" + info.tomcat.dir + ")", "tomcat", info.tomcat.files);
    fillGroup("App (apps_env: " + info.app.dir + ")", "app", info.app.files);
    logViewer.textContent = "";
    logDiv = null;
    logRaw = "";
    logModal.classList.remove("hidden");
    if (logFileSelect.value && logFileSelect.value !== "__none__")
        openLogFile();
}
function closeLogModal() {
    window.api.closeLog();
    logModal.classList.add("hidden");
    logViewer.textContent = "";
    logDiv = null;
    logRaw = "";
}
logsBtn.addEventListener("click", openLogModal);
logFileSelect.addEventListener("change", openLogFile);
document.getElementById("logClose").addEventListener("click", closeLogModal);
logModal.addEventListener("click", (e) => {
    if (e.target === logModal)
        closeLogModal();
});
