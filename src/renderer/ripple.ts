// src/renderer/ripple.ts
// Efecto ripple Material en botones y chips.

document.addEventListener("pointerdown", (e: PointerEvent) => {
  const el = (e.target as HTMLElement).closest("button, .chip") as HTMLElement | null;
  if (!el || (el as HTMLButtonElement).disabled || el.classList.contains("disabled")) return;
  const rect = el.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height) * 2.2;
  const ripple = document.createElement("span");
  ripple.className = "ripple";
  ripple.style.width = ripple.style.height = size + "px";
  ripple.style.left = (e.clientX - rect.left - size / 2) + "px";
  ripple.style.top = (e.clientY - rect.top - size / 2) + "px";
  el.appendChild(ripple);
  setTimeout(() => ripple.remove(), 500);
});
