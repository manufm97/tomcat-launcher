const testsModal = document.getElementById("testsModal");
const testsTree = document.getElementById("testsTree");
const testsStatus = document.getElementById("testsStatus");
const testsDirLabel = document.getElementById("testsDirLabel");
const testsProgress = document.getElementById("testsProgress");
const testsProgressText = document.getElementById("testsProgressText");
const testsRefresh = document.getElementById("testsRefresh");
const testsRunSelected = document.getElementById("testsRunSelected");
const testsRunAll = document.getElementById("testsRunAll");
const testsStop = document.getElementById("testsStop");
const testsMasterCheck = document.getElementById("testsMasterCheck");
const testsMasterLabelText = document.getElementById("testsMasterLabel");
const summaryPass = document.getElementById("summaryPass");
const summaryFail = document.getElementById("summaryFail");
const summarySkip = document.getElementById("summarySkip");
const summaryNone = document.getElementById("summaryNone");
let currentTests = [];
let selectedIds = new Set();
let currentTestDir = "";
let isTestRunning = false;
let testPollTimer = null;
const persistedTestStatus = new Map();
let expandedClasses = new Set();
function statusIcon(status, isLoading) {
    if (isLoading)
        return "sync";
    switch (status) {
        case "pass": return "check_circle";
        case "fail": return "error";
        case "skip": return "skip_next";
        default: return "radio_button_unchecked";
    }
}
function statusClass(status, isLoading) {
    if (isLoading)
        return "test-running";
    switch (status) {
        case "pass": return "test-pass";
        case "fail": return "test-fail";
        case "skip": return "test-skip";
        default: return "test-none";
    }
}
function renderNode(node, level) {
    const isSelected = selectedIds.has(node.id) || hasSelectedChild(node);
    const isLoading = isTestRunning && isSelected && node.status === "none";
    const row = document.createElement("div");
    row.className = "test-row";
    row.style.paddingLeft = `${level * 18}px`;
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "test-check";
    checkbox.disabled = isTestRunning;
    if (node.type === "class" && node.children && node.children.length > 0) {
        const totalMethods = countMethods([node]);
        const selectedMethods = countSelectedInNode(node);
        checkbox.checked = totalMethods > 0 && selectedMethods === totalMethods;
        checkbox.indeterminate = selectedMethods > 0 && selectedMethods < totalMethods;
    }
    else {
        checkbox.checked = selectedIds.has(node.id);
    }
    checkbox.addEventListener("change", () => {
        toggleSelection(node, checkbox.checked);
        if (node.type === "method" && checkbox.checked && node.className) {
            expandedClasses.add(node.className);
        }
        renderTests();
    });
    let expandBtn = null;
    if (node.type === "class" && node.children && node.children.length > 0) {
        expandBtn = document.createElement("button");
        expandBtn.className = "test-expand";
        expandBtn.type = "button";
        const isExpanded = expandedClasses.has(node.id);
        expandBtn.innerHTML = `<span class="material-icons">${isExpanded ? "expand_less" : "expand_more"}</span>`;
        expandBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (expandedClasses.has(node.id))
                expandedClasses.delete(node.id);
            else
                expandedClasses.add(node.id);
            renderTests();
        });
    }
    const icon = document.createElement("span");
    icon.className = `material-icons test-status ${statusClass(node.status, isLoading)}`;
    icon.textContent = statusIcon(node.status, isLoading);
    const name = document.createElement("span");
    name.className = "test-name";
    name.textContent = node.name;
    if (node.type === "class")
        name.classList.add("test-class-name");
    const meta = document.createElement("span");
    meta.className = "test-meta";
    if (node.duration !== undefined && node.status !== "none") {
        meta.textContent = `${node.duration}ms`;
    }
    if (node.type === "class" && node.children) {
        meta.textContent = `${countSelectedInNode(node)}/${countMethods([node])}`;
    }
    row.appendChild(checkbox);
    if (expandBtn)
        row.appendChild(expandBtn);
    row.appendChild(icon);
    row.appendChild(name);
    row.appendChild(meta);
    if (node.error)
        row.title = node.error;
    const container = document.createElement("div");
    container.className = "test-node";
    container.appendChild(row);
    if (node.children && expandedClasses.has(node.id)) {
        const children = document.createElement("div");
        children.className = "test-children";
        for (const child of node.children) {
            children.appendChild(renderNode(child, level + 1));
        }
        container.appendChild(children);
    }
    return container;
}
function hasSelectedChild(node) {
    if (node.type === "method")
        return selectedIds.has(node.id);
    if (!node.children)
        return false;
    return node.children.some((c) => hasSelectedChild(c));
}
function countSelectedInNode(node) {
    let count = 0;
    if (node.type === "method" && selectedIds.has(node.id))
        count++;
    if (node.children) {
        for (const child of node.children)
            count += countSelectedInNode(child);
    }
    return count;
}
function toggleSelection(node, checked) {
    if (checked)
        selectedIds.add(node.id);
    else
        selectedIds.delete(node.id);
    if (node.children) {
        for (const child of node.children)
            toggleSelection(child, checked);
    }
}
function updateMasterCheckbox() {
    const total = countMethods(currentTests);
    const selectedMethods = getSelectedMethodIds();
    const allSelected = total > 0 && selectedMethods.length === total;
    const someSelected = selectedMethods.length > 0 && selectedMethods.length < total;
    testsMasterCheck.checked = allSelected;
    testsMasterCheck.indeterminate = someSelected;
    testsMasterCheck.disabled = isTestRunning;
    testsMasterLabelText.textContent = allSelected ? "Deseleccionar todo" : "Seleccionar todo";
}
function renderTests() {
    testsTree.innerHTML = "";
    updateMasterCheckbox();
    if (currentTests.length === 0) {
        testsTree.innerHTML = '<p class="cfg-hint">No se encontraron tests en la ruta configurada.</p>';
        return;
    }
    for (const node of currentTests) {
        testsTree.appendChild(renderNode(node, 0));
    }
    updateStatus();
    updateSummary();
}
function updateStatus() {
    const total = countMethods(currentTests);
    const sel = getSelectedMethodIds().length;
    testsStatus.textContent = `${sel} de ${total} tests seleccionados`;
}
function updateSummary() {
    const counts = { pass: 0, fail: 0, skip: 0, none: 0 };
    function walk(nodes) {
        for (const n of nodes) {
            if (n.type === "method") {
                counts[n.status] = (counts[n.status] || 0) + 1;
            }
            if (n.children)
                walk(n.children);
        }
    }
    walk(currentTests);
    summaryPass.textContent = String(counts.pass);
    summaryFail.textContent = String(counts.fail);
    summarySkip.textContent = String(counts.skip);
    summaryNone.textContent = String(counts.none);
}
function countMethods(nodes) {
    let count = 0;
    for (const n of nodes) {
        if (n.type === "method")
            count++;
        if (n.children)
            count += countMethods(n.children);
    }
    return count;
}
function collectMethodIds(nodes) {
    const ids = [];
    for (const n of nodes) {
        if (n.type === "method")
            ids.push(n.id);
        if (n.children)
            ids.push(...collectMethodIds(n.children));
    }
    return ids;
}
function getSelectedMethodIds() {
    const allMethods = new Set(collectMethodIds(currentTests));
    return Array.from(selectedIds).filter((id) => allMethods.has(id));
}
function applyPersistedStatus(nodes) {
    for (const node of nodes) {
        const persisted = persistedTestStatus.get(node.id);
        if (persisted)
            node.status = persisted;
        if (node.children)
            applyPersistedStatus(node.children);
    }
}
async function refreshTestResults(name) {
    try {
        const res = await window.api.discoverTests(name);
        const previousSelection = new Set(selectedIds);
        currentTests = res.tests;
        currentTestDir = res.testDir;
        applyPersistedStatus(currentTests);
        selectedIds = new Set(Array.from(previousSelection).filter((id) => findNode(currentTests, id)));
        renderTests();
    }
    catch (e) {
    }
}
async function loadTests() {
    const name = select.value;
    if (!name)
        return;
    testsStatus.textContent = "Cargando tests...";
    testsTree.innerHTML = '<p class="cfg-hint">Cargando tests...</p>';
    try {
        const res = await window.api.discoverTests(name);
        currentTests = res.tests;
        currentTestDir = res.testDir;
        testsDirLabel.textContent = currentTestDir || "Ruta de tests no configurada";
        testsDirLabel.title = currentTestDir;
        applyPersistedStatus(currentTests);
        selectedIds = new Set(collectMethodIds(currentTests));
        renderTests();
    }
    catch (e) {
        testsTree.innerHTML = `<p class="cfg-hint">Error al cargar tests: ${e.message || e}</p>`;
        testsStatus.textContent = "Error";
    }
}
function setRunning(running) {
    isTestRunning = running;
    testsRefresh.disabled = running;
    testsRunSelected.disabled = running;
    testsRunAll.disabled = running;
    testsStop.disabled = !running;
    testsMasterCheck.disabled = running;
    testsProgress.classList.toggle("hidden", !running);
    renderTests();
    if (!running) {
        testsStatus.textContent = "Listo";
    }
}
async function runTests(ids, all = false) {
    const name = select.value;
    if (!name || (!all && ids.length === 0))
        return;
    setRunning(true);
    testsProgressText.textContent = all ? "Ejecutando todos los tests..." : `Ejecutando ${ids.length} test(s)...`;
    if (testPollTimer)
        window.clearInterval(testPollTimer);
    testPollTimer = window.setInterval(() => {
        refreshTestResults(name);
    }, 3000);
    await window.api.runTests({ name, ids, all });
}
function finishTestRun() {
    const name = select.value;
    if (testPollTimer) {
        window.clearInterval(testPollTimer);
        testPollTimer = null;
    }
    refreshTestResults(name).then(() => setRunning(false));
}
function openTestsModal() {
    testsModal.classList.remove("hidden");
    loadTests();
}
function closeTestsModal() {
    testsModal.classList.add("hidden");
}
testsBtn.addEventListener("click", openTestsModal);
document.getElementById("testsClose").addEventListener("click", closeTestsModal);
document.getElementById("testsCancel").addEventListener("click", closeTestsModal);
document.getElementById("testsRefresh").addEventListener("click", loadTests);
testsMasterCheck.addEventListener("click", (e) => {
    e.preventDefault();
    const total = countMethods(currentTests);
    const selectedMethods = getSelectedMethodIds();
    const allSelected = total > 0 && selectedMethods.length === total;
    if (allSelected) {
        selectedIds.clear();
    }
    else {
        for (const id of collectMethodIds(currentTests))
            selectedIds.add(id);
    }
    renderTests();
});
document.getElementById("testsRunSelected").addEventListener("click", () => {
    const ids = Array.from(selectedIds);
    runTests(ids);
});
document.getElementById("testsRunAll").addEventListener("click", () => {
    const ids = collectMethodIds(currentTests);
    selectedIds = new Set(ids);
    renderTests();
    runTests(ids, true);
});
testsStop.addEventListener("click", () => {
    window.api.stopTests();
    finishTestRun();
});
document.getElementById("testsChangeDir").addEventListener("click", async () => {
    const name = select.value;
    if (!name)
        return;
    const res = await window.api.browsePath(currentTestDir);
    if (res && !res.canceled && res.path) {
        await window.api.setTestDir({ name, dir: res.path });
        await loadTests();
    }
});
function findNode(nodes, key) {
    for (const n of nodes) {
        if (n.id === key)
            return n;
        if (n.type === "class" && n.className === key)
            return n;
        if (n.children) {
            const found = findNode(n.children, key);
            if (found)
                return found;
        }
    }
    return null;
}
window.api.onTestProgress((payload) => {
    if (payload.type === "finished" && payload.results && Array.isArray(payload.results)) {
        for (const r of payload.results) {
            persistedTestStatus.set(r.id, r.status);
        }
    }
    if (payload.type === "done") {
        finishTestRun();
    }
});
