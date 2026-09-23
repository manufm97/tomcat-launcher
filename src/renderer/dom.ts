// src/renderer/dom.ts
// Referencias DOM y estado global compartido.

const select       = document.getElementById("projectSelect") as HTMLSelectElement;
const startBtn     = document.getElementById("startBtn") as HTMLButtonElement;
const stopBtn      = document.getElementById("stopBtn") as HTMLButtonElement;
const clearBtn     = document.getElementById("clearBtn") as HTMLButtonElement;
const statusEl     = document.getElementById("status") as HTMLSpanElement;
const consoleEl    = document.getElementById("console") as HTMLDivElement;
const appBtn       = document.getElementById("appBtn") as HTMLButtonElement;
const projDir      = document.getElementById("projDir") as HTMLAnchorElement;
const vscodeBtn    = document.getElementById("vscodeBtn") as HTMLButtonElement;
const debugBtn     = document.getElementById("debugBtn") as HTMLButtonElement;
const logsBtn      = document.getElementById("logsBtn") as HTMLButtonElement;
const cfgBtn       = document.getElementById("cfgBtn") as HTMLButtonElement;
const testsBtn     = document.getElementById("testsBtn") as HTMLButtonElement;

let currentUrl      = "";
let currentProjDir  = "";
let isRunning       = false;
let currentRaw      = "";
let currentDiv: HTMLDivElement | null = null;
