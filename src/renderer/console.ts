// src/renderer/console.ts
// Consola principal: append de texto con highlight y eventos del proceso.

function append(text: string): void {
  const atBottom = consoleEl.scrollTop + consoleEl.clientHeight >= consoleEl.scrollHeight - 4;
  const parts = text.split("\n");
  if (currentDiv === null) {
    currentDiv = document.createElement("div");
    currentDiv.className = "ln";
    consoleEl.appendChild(currentDiv);
  }
  currentRaw += parts[0];
  currentDiv.innerHTML = highlightLine(currentRaw);
  for (let i = 1; i < parts.length; i++) {
    currentRaw = parts[i];
    currentDiv = document.createElement("div");
    currentDiv.className = "ln";
    currentDiv.innerHTML = highlightLine(currentRaw);
    consoleEl.appendChild(currentDiv);
  }
  if (atBottom) consoleEl.scrollTop = consoleEl.scrollHeight;
}

window.api.onConsole((text: string) => append(text));
window.api.onStatus((text: string) => { statusEl.textContent = text; });
window.api.onClear(() => { consoleEl.textContent = ""; currentDiv = null; currentRaw = ""; });
window.api.onRunning((state: boolean) => applyRunning(state));
