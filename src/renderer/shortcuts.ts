// src/renderer/shortcuts.ts
// Atajos de teclado: reutilizan los manejadores de los botones (click()).

function clickBtn(btn: HTMLButtonElement): void {
  if (!btn.disabled) btn.click();
}

function isEditable(el: Element | null): boolean {
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) {
    return !["checkbox", "radio", "button", "submit", "reset", "range", "color", "file"].includes(el.type);
  }
  return el instanceof HTMLElement && el.isContentEditable;
}

function shortcutBlocked(): boolean {
  if (document.querySelector(".modal:not(.hidden)")) return true;
  return isEditable(document.activeElement);
}

const shortcutActions: Record<string, () => void> = {
  start: () => clickBtn(startBtn),
  debug: () => clickBtn(debugBtn),
  stop: () => clickBtn(stopBtn),
  "open-url": () => clickBtn(appBtn),
  tests: () => clickBtn(testsBtn),
  clear: () => clickBtn(clearBtn),
  logs: () => clickBtn(logsBtn),
  config: () => clickBtn(cfgBtn),
  vscode: () => clickBtn(vscodeBtn),
  "base-path": () => clickBtn(document.getElementById("pathBtn") as HTMLButtonElement),
  "add-project": () => clickBtn(document.getElementById("addProjectBtn") as HTMLButtonElement),
};

window.api.onShortcut((action: string) => {
  if (shortcutBlocked()) return;
  const fn = shortcutActions[action];
  if (fn) fn();
});
