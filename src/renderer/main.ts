// src/renderer/main.ts
// Punto de entrada: botones de accion y refresh inicial.

startBtn.addEventListener("click", () => {
  const name = select.value;
  if (name && !startBtn.disabled) {
    applyRunning(true);
    window.api.start(name);
  }
});

stopBtn.addEventListener("click", () => {
  const name = select.value;
  if (name && !stopBtn.disabled) {
    window.api.stop(name);
  }
});

clearBtn.addEventListener("click", () => window.api.clear());

debugBtn.addEventListener("click", () => {
  const name = select.value;
  if (name && !debugBtn.disabled) {
    applyRunning(true);
    window.api.debug(name);
  }
});

refresh();
