// src/renderer/types.d.ts
// Tipos globales compartidos entre todos los modulos del renderer.

interface Api {
  getProjects(): Promise<string[]>;
  getAppUrl(name: string): Promise<{ url: string; projectDir: string }>;
  getLogsInfo(name: string): Promise<{ tomcat: { dir: string; files: string[] }; app: { dir: string; files: string[] } }>;
  getConfig(name: string): Promise<{ entries: ConfigEntry[] }>;
  saveConfig(payload: { name: string; entries: ConfigEntry[] }): Promise<void>;
  addProject(payload: {
    name: string;
    javaHome: string;
    tomcatHome: string;
    startDocker?: boolean;
    dockerCompose?: string;
    dockerWaitPort?: string;
  }): Promise<{ ok: boolean; name?: string; error?: string }>;
  scanJava(): Promise<{ name: string; path: string; hasJava: boolean }[]>;
  scanTomcat(): Promise<{ name: string; path: string }[]>;
  browsePath(currentPath: string): Promise<{ canceled: boolean; path?: string }>;
  browseFile(opts: { currentPath?: string; title?: string; extensions?: string[] }): Promise<{ canceled: boolean; path?: string }>;
  chooseResourcesPath(): Promise<{ ok: boolean; path?: string }>;
  discoverTests(name: string): Promise<{ tests: TestNode[]; testDir: string }>;
  runTests(payload: { name: string; ids: string[]; all?: boolean }): Promise<{ ok: boolean; error?: string }>;
  stopTests(): void;
  setTestDir(payload: { name: string; dir: string }): Promise<void>;
  onTestProgress(cb: (payload: any) => void): void;
  start(name: string): void;
  debug(name: string): void;
  stop(name: string): void;
  openUrl(url: string): void;
  openLog(payload: { name: string; loc: string; file: string }): void;
  closeLog(): void;
  clear(): void;
  windowMinimize(): void;
  windowToggleMaximize(): void;
  windowClose(): void;
  onConsole(cb: (text: string) => void): void;
  onStatus(cb: (text: string) => void): void;
  onClear(cb: () => void): void;
  onRunning(cb: (state: boolean) => void): void;
  onLogChunk(cb: (text: string) => void): void;
  onWindowMaximized(cb: (maximized: boolean) => void): void;
  onSettingsUpdated(cb: () => void): void;
}

interface ConfigEntry {
  type: "kv" | "other";
  key?: string;
  value?: string;
  text?: string;
  kind?: "path" | "string" | "bool";
  required?: boolean;
  description?: string;
  common?: boolean;
  db?: "property" | "registry";
  group?: "docker";
}

interface TestNode {
  id: string;
  name: string;
  type: "class" | "method";
  status: "none" | "pass" | "fail" | "skip";
  children?: TestNode[];
  className?: string;
  duration?: number;
  error?: string;
}
