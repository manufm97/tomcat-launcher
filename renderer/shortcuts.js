function clickBtn(btn) {
    if (!btn.disabled)
        btn.click();
}
function isEditable(el) {
    if (el instanceof HTMLTextAreaElement)
        return true;
    if (el instanceof HTMLInputElement) {
        return !["checkbox", "radio", "button", "submit", "reset", "range", "color", "file"].includes(el.type);
    }
    return el instanceof HTMLElement && el.isContentEditable;
}
function shortcutBlocked() {
    if (document.querySelector(".modal:not(.hidden)"))
        return true;
    return isEditable(document.activeElement);
}
const shortcutActions = {
    start: () => clickBtn(startBtn),
    debug: () => clickBtn(debugBtn),
    stop: () => clickBtn(stopBtn),
    "open-url": () => clickBtn(appBtn),
    tests: () => clickBtn(testsBtn),
    clear: () => clickBtn(clearBtn),
    logs: () => clickBtn(logsBtn),
    config: () => clickBtn(cfgBtn),
    vscode: () => clickBtn(vscodeBtn),
    "base-path": () => clickBtn(document.getElementById("pathBtn")),
    "add-project": () => clickBtn(document.getElementById("addProjectBtn")),
};
window.api.onShortcut((action) => {
    if (shortcutBlocked())
        return;
    const fn = shortcutActions[action];
    if (fn)
        fn();
});
