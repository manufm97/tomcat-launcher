function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function setChipText(el, txt) {
    const label = el.querySelector(".chip-label");
    if (label) {
        label.textContent = txt;
    }
    else {
        el.textContent = txt;
    }
}
const HL = [
    { cls: "ts", re: /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?|\b\d{1,2}:\d{2}:\d{2}(?:\.\d+)?\b/ },
    { cls: "err", re: /\b(?:ERROR|ERR|CRITICAL|CRIT|FATAL|FAIL|FAILURE|SEVERE)\b/ },
    { cls: "warn", re: /\b(?:WARN|WARNING)\b/ },
    { cls: "info", re: /\b(?:INFO|NOTICE)\b/ },
    { cls: "dbg", re: /\b(?:DEBUG|TRACE|VERBOSE|FINE|CONFIG)\b/ },
    { cls: "ok", re: /\b(?:SUCCESS|OK)\b/ },
    { cls: "brk", re: /\[[^\]]*\]/ },
    { cls: "str", re: /"(?:[^"\\]|\\.)*"|'[^']*'/ },
    { cls: "url", re: /https?:\/\/[^\s]+|[A-Za-z]:\\[^\s]+|\/(?:[\w.\-/])+/ },
    { cls: "num", re: /\b\d+(?:\.\d+)?\b/ }
];
const COMBINED = new RegExp(HL.map((p) => "(" + p.re.source + ")").join("|"), "g");
function highlightLine(raw) {
    if (raw.trim().startsWith("===")) {
        return '<span class="sep">' + esc(raw) + "</span>";
    }
    let out = "";
    let last = 0;
    let m;
    COMBINED.lastIndex = 0;
    while ((m = COMBINED.exec(raw)) !== null) {
        if (m.index > last)
            out += esc(raw.slice(last, m.index));
        let ci = -1;
        for (let i = 1; i <= HL.length; i++) {
            if (m[i] !== undefined) {
                ci = i - 1;
                break;
            }
        }
        out += '<span class="' + HL[ci].cls + '">' + esc(m[0]) + "</span>";
        last = m.index + m[0].length;
        if (m[0].length === 0)
            COMBINED.lastIndex++;
    }
    out += esc(raw.slice(last));
    return out;
}
