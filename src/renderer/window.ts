// src/renderer/window.ts
// Controles de ventana frameless (minimizar, maximizar, cerrar).

const winMaxBtn = document.getElementById("winMax") as HTMLButtonElement;

document.getElementById("winMin")!.addEventListener("click", () => window.api.windowMinimize());
winMaxBtn.addEventListener("click", () => window.api.windowToggleMaximize());
document.getElementById("winClose")!.addEventListener("click", () => window.api.windowClose());

document.querySelector("header")!.addEventListener("dblclick", (e: MouseEvent) => {
  if ((e.target as HTMLElement).closest("button, a, select")) return;
  window.api.windowToggleMaximize();
});

window.api.onWindowMaximized((maximized: boolean) => {
  document.body.classList.toggle("is-maximized", !!maximized);
  winMaxBtn.title = maximized ? "Restaurar" : "Maximizar";
});
