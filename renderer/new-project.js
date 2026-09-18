const newProjectModal = document.getElementById("newProjectModal");
const newProjectName = document.getElementById("newProjectName");
const newProjectJava = document.getElementById("newProjectJava");
const newProjectTomcat = document.getElementById("newProjectTomcat");
const addProjectBtn = document.getElementById("addProjectBtn");
const newProjectDocker = document.getElementById("newProjectDocker");
const newProjectDockerFields = document.getElementById("newProjectDockerFields");
const newProjectDockerPath = document.getElementById("newProjectDockerPath");
const newProjectDockerPort = document.getElementById("newProjectDockerPort");
const newProjectDockerBrowseBtn = document.getElementById("newProjectDockerBrowse");
const MANUAL_OPT = "__manual__";
async function populateNewProjectSelects() {
    const javaList = await window.api.scanJava();
    newProjectJava.innerHTML = '<option value="" disabled selected>JAVA_HOME</option>';
    if (javaList.length === 0) {
        newProjectJava.innerHTML += '<option value="" disabled>(no se encontraron)</option>';
    }
    for (const j of javaList) {
        const opt = document.createElement("option");
        opt.value = j.path;
        opt.textContent = j.name;
        newProjectJava.appendChild(opt);
    }
    const javaManual = document.createElement("option");
    javaManual.value = MANUAL_OPT;
    javaManual.textContent = "Otra...";
    newProjectJava.appendChild(javaManual);
    const tomcatList = await window.api.scanTomcat();
    newProjectTomcat.innerHTML = '<option value="" disabled selected>TOMCAT_HOME</option>';
    if (tomcatList.length === 0) {
        newProjectTomcat.innerHTML += '<option value="" disabled>(no se encontraron)</option>';
    }
    for (const t of tomcatList) {
        const opt = document.createElement("option");
        opt.value = t.path;
        opt.textContent = t.name;
        newProjectTomcat.appendChild(opt);
    }
    const tomcatManual = document.createElement("option");
    tomcatManual.value = MANUAL_OPT;
    tomcatManual.textContent = "Otra...";
    newProjectTomcat.appendChild(tomcatManual);
}
newProjectJava.addEventListener("change", async (e) => {
    const target = e.target;
    if (target.value === MANUAL_OPT) {
        const res = await window.api.browsePath("");
        if (res && !res.canceled && res.path) {
            const opt = document.createElement("option");
            opt.value = res.path;
            opt.textContent = res.path;
            newProjectJava.insertBefore(opt, newProjectJava.lastElementChild);
            newProjectJava.value = res.path;
        }
        else {
            newProjectJava.value = "";
        }
    }
});
newProjectTomcat.addEventListener("change", async (e) => {
    const target = e.target;
    if (target.value === MANUAL_OPT) {
        const res = await window.api.browsePath("");
        if (res && !res.canceled && res.path) {
            const opt = document.createElement("option");
            opt.value = res.path;
            opt.textContent = res.path;
            newProjectTomcat.insertBefore(opt, newProjectTomcat.lastElementChild);
            newProjectTomcat.value = res.path;
        }
        else {
            newProjectTomcat.value = "";
        }
    }
});
function updateNewProjectDockerFields() {
    newProjectDockerFields.classList.toggle("hidden", !newProjectDocker.checked);
}
newProjectDocker.addEventListener("change", updateNewProjectDockerFields);
newProjectDockerBrowseBtn.addEventListener("click", async () => {
    const res = await window.api.browseFile({
        currentPath: newProjectDockerPath.value || "",
        title: "Seleccionar fichero docker compose",
        extensions: ["yml", "yaml"],
    });
    if (res && !res.canceled && res.path)
        newProjectDockerPath.value = res.path;
});
function openNewProjectModal() {
    newProjectName.value = "";
    newProjectJava.value = "";
    newProjectTomcat.value = "";
    newProjectDocker.checked = false;
    newProjectDockerPath.value = "";
    newProjectDockerPort.value = "";
    updateNewProjectDockerFields();
    newProjectModal.classList.remove("hidden");
    populateNewProjectSelects();
    newProjectName.focus();
}
function closeNewProjectModal() {
    newProjectModal.classList.add("hidden");
}
addProjectBtn.addEventListener("click", openNewProjectModal);
document.getElementById("newProjectCancel").addEventListener("click", closeNewProjectModal);
document.getElementById("newProjectClose").addEventListener("click", closeNewProjectModal);
newProjectModal.addEventListener("click", (e) => {
    if (e.target === newProjectModal)
        closeNewProjectModal();
});
async function createNewProject() {
    const name = newProjectName.value.trim();
    const javaHome = newProjectJava.value.trim();
    const tomcatHome = newProjectTomcat.value.trim();
    const startDocker = newProjectDocker.checked;
    const dockerCompose = startDocker ? newProjectDockerPath.value.trim() : "";
    const dockerWaitPort = startDocker ? newProjectDockerPort.value.trim() : "";
    if (!name) {
        newProjectName.focus();
        return;
    }
    if (newProjectDocker.checked && !dockerCompose) {
        statusEl.textContent = "ERROR: indica la ruta del compose o desmarca Docker.";
        newProjectDockerPath.focus();
        return;
    }
    newProjectName.disabled = true;
    newProjectJava.disabled = true;
    newProjectTomcat.disabled = true;
    newProjectDocker.disabled = true;
    newProjectDockerPath.disabled = true;
    newProjectDockerPort.disabled = true;
    let res;
    try {
        res = await window.api.addProject({ name, javaHome, tomcatHome, startDocker, dockerCompose, dockerWaitPort });
    }
    catch (e) {
        res = { ok: false, error: e.message || String(e) };
    }
    newProjectName.disabled = false;
    newProjectJava.disabled = false;
    newProjectTomcat.disabled = false;
    newProjectDocker.disabled = false;
    newProjectDockerPath.disabled = false;
    newProjectDockerPort.disabled = false;
    if (res.ok) {
        closeNewProjectModal();
        await refresh();
        select.value = res.name || "";
        updateLink();
        statusEl.textContent = "Proyecto " + res.name + " creado.";
    }
    else {
        statusEl.textContent = "ERROR: " + (res.error || "no se pudo crear");
        newProjectName.focus();
        newProjectName.select();
    }
}
document.getElementById("newProjectCreate").addEventListener("click", createNewProject);
newProjectName.addEventListener("keydown", (e) => {
    if (e.key === "Enter")
        createNewProject();
    if (e.key === "Escape")
        closeNewProjectModal();
});
