async function updateLink() {
    const name = select.value;
    if (!name) {
        appBtn.disabled = true;
        appBtn.title = "Abrir en navegador";
        currentUrl = "";
        projDir.classList.add("disabled");
        setChipText(projDir, "Carpeta");
        projDir.title = "";
        projDir.href = "#";
        currentProjDir = "";
        vscodeBtn.disabled = true;
        logsBtn.disabled = true;
        cfgBtn.disabled = true;
        testsBtn.disabled = true;
        debugBtn.disabled = true;
        startBtn.disabled = true;
        return;
    }
    const info = await window.api.getAppUrl(name);
    currentUrl = info.url;
    appBtn.title = currentUrl;
    appBtn.disabled = false;
    currentProjDir = info.projectDir || "";
    if (currentProjDir) {
        setChipText(projDir, currentProjDir);
        projDir.title = "Abrir carpeta: " + currentProjDir;
        projDir.href = currentProjDir;
        projDir.classList.remove("disabled");
        vscodeBtn.disabled = false;
        logsBtn.disabled = false;
        cfgBtn.disabled = false;
        testsBtn.disabled = false;
        debugBtn.disabled = false;
    }
    else {
        setChipText(projDir, "Carpeta (no definida)");
        projDir.title = "";
        projDir.href = "#";
        projDir.classList.add("disabled");
        vscodeBtn.disabled = true;
        logsBtn.disabled = true;
        cfgBtn.disabled = true;
        testsBtn.disabled = true;
    }
    applyRunning(isRunning);
}
appBtn.addEventListener("click", () => {
    if (currentUrl)
        window.api.openUrl(currentUrl);
});
projDir.addEventListener("click", (e) => {
    e.preventDefault();
    if (currentProjDir)
        window.api.openUrl(currentProjDir);
});
vscodeBtn.addEventListener("click", () => {
    const name = select.value;
    if (name && !vscodeBtn.disabled)
        window.api.openVscode(name);
});
select.addEventListener("change", updateLink);
function applyRunning(state) {
    isRunning = !!state;
    const hasProject = !!(select.value && !select.disabled);
    startBtn.disabled = isRunning || !hasProject;
    debugBtn.disabled = isRunning || !hasProject;
    stopBtn.disabled = !isRunning;
    document.body.classList.toggle("is-running", isRunning);
}
async function refresh() {
    const projects = await window.api.getProjects();
    select.innerHTML = "";
    if (projects.length === 0) {
        const opt = document.createElement("option");
        opt.textContent = "(sin proyectos con .env)";
        select.appendChild(opt);
        startBtn.disabled = true;
        return;
    }
    for (const p of projects) {
        const opt = document.createElement("option");
        opt.value = p;
        opt.textContent = p;
        select.appendChild(opt);
    }
    startBtn.disabled = false;
    debugBtn.disabled = false;
    updateLink();
}
async function chooseBasePath() {
    const res = await window.api.chooseResourcesPath();
    if (res && res.ok) {
        statusEl.textContent = "Ruta base: " + res.path;
        refresh();
    }
}
document.getElementById("pathBtn").addEventListener("click", chooseBasePath);
window.api.onSettingsUpdated(() => refresh());
