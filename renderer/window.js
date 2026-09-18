const winMaxBtn = document.getElementById("winMax");
document.getElementById("winMin").addEventListener("click", () => window.api.windowMinimize());
winMaxBtn.addEventListener("click", () => window.api.windowToggleMaximize());
document.getElementById("winClose").addEventListener("click", () => window.api.windowClose());
document.querySelector("header").addEventListener("dblclick", (e) => {
    if (e.target.closest("button, a, select"))
        return;
    window.api.windowToggleMaximize();
});
window.api.onWindowMaximized((maximized) => {
    document.body.classList.toggle("is-maximized", !!maximized);
    winMaxBtn.title = maximized ? "Restaurar" : "Maximizar";
});
