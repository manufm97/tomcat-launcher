// src/renderer/config.ts
// Modal de configuracion (.env): editor visual de variables con browse de rutas,
// descripciones por variable, indicador de tipo y variables opcionales agrupadas.

const configModal = document.getElementById("configModal") as HTMLDivElement;
const configRows  = document.getElementById("configRows") as HTMLDivElement;

const addVarModal  = document.getElementById("addVarModal") as HTMLDivElement;
const addVarKind   = document.getElementById("addVarKind") as HTMLSelectElement;
const addVarKey    = document.getElementById("addVarKey") as HTMLInputElement;
const addVarValue  = document.getElementById("addVarValue") as HTMLInputElement;
const addVarBrowse = document.getElementById("addVarBrowse") as HTMLButtonElement;

let configName    = "";
let configEntries: ConfigEntry[] = [];

function isKnownKey(entry: ConfigEntry): boolean {
  return entry.type === "kv" && !!entry.description;
}

function createPathInput(entry: ConfigEntry): { wrap: HTMLElement; input: HTMLInputElement } {
  const wrap = document.createElement("div");
  wrap.className = "cfg-path-wrap";

  const input = document.createElement("input");
  input.className = "cfg-val cfg-path-input";
  input.value = entry.value || "";
  input.placeholder = "C:\\ruta\\...";
  input.addEventListener("input", () => { entry.value = input.value; });

  const browse = document.createElement("button");
  browse.className = "cfg-browse-in-input";
  browse.title = "Explorar ruta";
  browse.type = "button";
  browse.innerHTML = '<span class="material-icons">folder_open</span>';
  browse.addEventListener("click", async () => {
    const res = await window.api.browsePath(entry.value || "");
    if (res && !res.canceled) {
      entry.value = res.path;
      input.value = res.path;
    }
  });

  wrap.appendChild(input);
  wrap.appendChild(browse);
  return { wrap, input };
}

function isTrue(value: string | undefined): boolean {
  return /^(true|1|si|sí|y|yes|on)$/i.test((value || "").trim());
}

function createBoolInput(entry: ConfigEntry): { wrap: HTMLElement; input: HTMLInputElement } {
  const wrap = document.createElement("label");
  wrap.className = "cfg-switch";

  const input = document.createElement("input");
  input.type = "checkbox";
  input.className = "cfg-switch-input";
  input.checked = isTrue(entry.value);
  entry.value = input.checked ? "true" : "false";

  const track = document.createElement("span");
  track.className = "cfg-switch-track";
  const thumb = document.createElement("span");
  thumb.className = "cfg-switch-thumb";
  track.appendChild(thumb);

  const text = document.createElement("span");
  text.className = "cfg-switch-text";
  text.textContent = input.checked ? "Sí" : "No";

  input.addEventListener("change", () => {
    entry.value = input.checked ? "true" : "false";
    text.textContent = input.checked ? "Sí" : "No";
  });

  wrap.appendChild(input);
  wrap.appendChild(track);
  wrap.appendChild(text);
  return { wrap, input };
}

function createRow(entry: ConfigEntry, idx: number): HTMLElement {
  const row = document.createElement("div");
  row.className = "cfg-row";

  const label = document.createElement("label");
  label.className = "cfg-label";
  label.textContent = entry.description || entry.key || "";

  const keyBadge = document.createElement("span");
  keyBadge.className = "cfg-key-badge";
  keyBadge.innerHTML = `<span class="material-icons cfg-type-icon">${entry.kind === "path" ? "folder" : "text_fields"}</span>${entry.key || ""}`;

  const inputs = document.createElement("div");
  inputs.className = "cfg-inputs";

  if (entry.kind === "path") {
    const { wrap } = createPathInput(entry);
    inputs.appendChild(wrap);
  } else if (entry.kind === "bool") {
    const { wrap } = createBoolInput(entry);
    inputs.appendChild(wrap);
  } else {
    const valInput = document.createElement("input");
    valInput.className = "cfg-val";
    valInput.value = entry.value || "";
    valInput.placeholder = "valor";
    valInput.addEventListener("input", () => { entry.value = valInput.value; });
    inputs.appendChild(valInput);
  }

  if (!entry.required) {
    const del = document.createElement("button");
    del.className = "cfg-del";
    del.title = "Eliminar";
    del.innerHTML = '<span class="material-icons">delete</span>';
    del.addEventListener("click", () => {
      configEntries.splice(idx, 1);
      renderConfigRows();
    });
    inputs.appendChild(del);
  }

  row.appendChild(label);
  row.appendChild(keyBadge);
  row.appendChild(inputs);
  return row;
}

function renderCommonSection(common: ConfigEntry[]): HTMLElement {
  const section = document.createElement("section");
  section.className = "cfg-section";

  const title = document.createElement("h3");
  title.className = "cfg-section-title";
  title.textContent = "Configuración común";
  section.appendChild(title);

  common.forEach((entry) => {
    section.appendChild(createRow(entry, configEntries.indexOf(entry)));
  });

  return section;
}

function renderOptionalSection(optional: ConfigEntry[]): HTMLElement {
  const section = document.createElement("section");
  section.className = "cfg-section cfg-section-collapsible";

  const header = document.createElement("button");
  header.className = "cfg-section-header";
  header.type = "button";
  header.innerHTML = `<span class="material-icons cfg-section-icon">expand_more</span><span>Parámetros opcionales (${optional.length})</span>`;
  header.addEventListener("click", () => {
    section.classList.toggle("collapsed");
  });

  const body = document.createElement("div");
  body.className = "cfg-section-body";
  optional.forEach((entry) => {
    body.appendChild(createRow(entry, configEntries.indexOf(entry)));
  });

  section.appendChild(header);
  section.appendChild(body);
  return section;
}

function renderDbSection(property: ConfigEntry[], registry: ConfigEntry[]): HTMLElement {
  const section = document.createElement("section");
  section.className = "cfg-section";

  const title = document.createElement("h3");
  title.className = "cfg-section-title";
  title.textContent = "Configuración de base de datos";
  section.appendChild(title);

  const grid = document.createElement("div");
  grid.className = "cfg-db-grid";

  const colProperty = document.createElement("div");
  colProperty.className = "cfg-db-col";
  const propTitle = document.createElement("h4");
  propTitle.className = "cfg-db-col-title";
  propTitle.textContent = "Propiedades";
  colProperty.appendChild(propTitle);
  property.forEach((entry) => {
    colProperty.appendChild(createRow(entry, configEntries.indexOf(entry)));
  });

  const colRegistry = document.createElement("div");
  colRegistry.className = "cfg-db-col";
  const regTitle = document.createElement("h4");
  regTitle.className = "cfg-db-col-title";
  regTitle.textContent = "Registro Windows";
  colRegistry.appendChild(regTitle);
  registry.forEach((entry) => {
    colRegistry.appendChild(createRow(entry, configEntries.indexOf(entry)));
  });

  grid.appendChild(colProperty);
  grid.appendChild(colRegistry);
  section.appendChild(grid);

  return section;
}

// --- Seccion Docker ---
// Se muestran siempre (aunque no esten en el .env) para poder activar y
// ajustar los servicios Docker sin editar el fichero a mano.
const DOCKER_FIELDS: { key: string; description: string; kind: "path" | "string" | "bool" }[] = [
  { key: "START_DOCKER", description: "Arrancar servicios Docker", kind: "bool" },
  { key: "DOCKER_COMPOSE_FILE", description: "Fichero compose a arrancar (vacío: se detecta solo)", kind: "path" },
  { key: "DOCKER_WAIT_PORT", description: "Puerto que debe escuchar antes de arrancar Tomcat", kind: "string" },
  { key: "DOCKER_HEALTH_URL", description: "URL de salud de los servicios Docker", kind: "string" },
  { key: "DOCKER_WAIT_TIMEOUT", description: "Segundos de espera de los servicios Docker", kind: "string" },
];

function ensureDockerEntries(): void {
  DOCKER_FIELDS.forEach((f) => {
    const existing = configEntries.find((e) => e.type === "kv" && e.key === f.key);
    if (existing) {
      existing.group = "docker";
      if (!existing.description) existing.description = f.description;
      return;
    }
    configEntries.push({
      type: "kv",
      key: f.key,
      value: "",
      kind: f.kind,
      required: false,
      common: false,
      description: f.description,
      group: "docker",
    });
  });
}

function renderDockerSection(docker: ConfigEntry[]): HTMLElement {
  const section = document.createElement("section");
  section.className = "cfg-section cfg-section-collapsible";

  const header = document.createElement("button");
  header.className = "cfg-section-header";
  header.type = "button";
  header.innerHTML = `<span class="material-icons cfg-section-icon">expand_more</span><span>Servicios Docker</span>`;
  header.addEventListener("click", () => {
    section.classList.toggle("collapsed");
  });

  const body = document.createElement("div");
  body.className = "cfg-section-body";

  const hint = document.createElement("p");
  hint.className = "cfg-hint";
  hint.textContent = "Si el proyecto tiene carpeta docker/ (o un compose en su raíz), se arranca antes de Tomcat. Déjalo vacío para usar la detección automática.";
  body.appendChild(hint);

  docker.forEach((entry) => {
    body.appendChild(createRow(entry, configEntries.indexOf(entry)));
  });

  section.appendChild(header);
  section.appendChild(body);
  return section;
}

function renderConfigRows(): void {
  configRows.innerHTML = '<p class="cfg-hint">Edita las variables. Los comentarios se conservan al guardar.</p>';

  const common: ConfigEntry[] = [];
  const dbProperty: ConfigEntry[] = [];
  const dbRegistry: ConfigEntry[] = [];
  const docker: ConfigEntry[] = [];
  const optional: ConfigEntry[] = [];

  configEntries.forEach((entry) => {
    if (entry.type !== "kv") return;
    if (entry.db === "property") {
      dbProperty.push(entry);
    } else if (entry.db === "registry") {
      dbRegistry.push(entry);
    } else if (entry.group === "docker") {
      docker.push(entry);
    } else if (entry.common || entry.required) {
      common.push(entry);
    } else {
      optional.push(entry);
    }
  });

  if (common.length > 0) {
    configRows.appendChild(renderCommonSection(common));
  }

  if (dbProperty.length > 0 || dbRegistry.length > 0) {
    configRows.appendChild(renderDbSection(dbProperty, dbRegistry));
  }

  if (docker.length > 0) {
    configRows.appendChild(renderDockerSection(docker));
  }

  if (optional.length > 0) {
    configRows.appendChild(renderOptionalSection(optional));
  }
}

async function openConfigModal(): Promise<void> {
  configName = select.value;
  if (!configName) return;
  const info = await window.api.getConfig(configName);
  configEntries = info.entries || [];
  ensureDockerEntries();
  renderConfigRows();
  configModal.classList.remove("hidden");
}

function closeConfigModal(): void {
  configModal.classList.add("hidden");
}

function openAddVarModal(): void {
  addVarKind.value = "string";
  addVarKey.value = "";
  addVarValue.value = "";
  updateAddVarBrowse();
  addVarModal.classList.remove("hidden");
  addVarKey.focus();
}

function closeAddVarModal(): void {
  addVarModal.classList.add("hidden");
}

function updateAddVarBrowse(): void {
  if (addVarKind.value === "path") addVarValue.placeholder = "C:\\ruta\\...";
  else if (addVarKind.value === "bool") addVarValue.placeholder = "true / false";
  else addVarValue.placeholder = "Valor";
  addVarBrowse.style.display = addVarKind.value === "path" ? "flex" : "none";
}

addVarKind.addEventListener("change", updateAddVarBrowse);

addVarBrowse.addEventListener("click", async () => {
  const res = await window.api.browsePath(addVarValue.value || "");
  if (res && !res.canceled) {
    addVarValue.value = res.path;
  }
});

document.getElementById("addVarConfirm")!.addEventListener("click", () => {
  const key = addVarKey.value.trim();
  if (!key) {
    addVarKey.focus();
    return;
  }
  const kind = addVarKind.value as "path" | "string" | "bool";
  const meta = inferConfigMeta(key);
  configEntries.push({
    type: "kv",
    key,
    value: kind === "bool" ? (isTrue(addVarValue.value) ? "true" : "false") : addVarValue.value,
    kind,
    required: false,
    common: false,
    description: meta.description || key,
  });
  closeAddVarModal();
  renderConfigRows();
});

document.getElementById("addVarCancel")!.addEventListener("click", closeAddVarModal);
document.getElementById("addVarClose")!.addEventListener("click", closeAddVarModal);
addVarModal.addEventListener("click", (e: MouseEvent) => {
  if (e.target === addVarModal) closeAddVarModal();
});

function inferConfigMeta(key: string): { description: string; kind: "path" | "string" | "bool" } {
  const existing = configEntries.find((e) => e.type === "kv" && e.key === key);
  if (existing) return { description: existing.description || key, kind: existing.kind || "string" };
  const lower = key.toLowerCase();
  const isBool = /^(skip|enable|use|disable|allow)_/.test(lower);
  const isPath = /_(path|dir|home)$/.test(lower) || lower.includes("path") || lower.includes("dir") || lower.includes("home");
  return { description: key, kind: isBool ? "bool" : isPath ? "path" : "string" };
}

document.getElementById("configAdd")!.addEventListener("click", openAddVarModal);

document.getElementById("configCancel")!.addEventListener("click", closeConfigModal);
document.getElementById("configClose")!.addEventListener("click", closeConfigModal);
configModal.addEventListener("click", (e: MouseEvent) => {
  if (e.target === configModal) closeConfigModal();
});

document.getElementById("configSave")!.addEventListener("click", async () => {
  // Las variables Docker vacias no se escriben: asi el .env queda limpio y
  // sigue funcionando la deteccion automatica de la carpeta docker/.
  const entries = configEntries.filter(
    (e) => e.type !== "kv" || e.group !== "docker" || (e.value || "").trim() !== ""
  );
  await window.api.saveConfig({ name: configName, entries });
  closeConfigModal();
});

cfgBtn.addEventListener("click", openConfigModal);
