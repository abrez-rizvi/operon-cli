import fs from "node:fs";
import path from "node:path";
import { operonHome } from "./paths.js";

export interface UserGlobalConfig {
  convexUrl?: string;
  mekoToken?: string;
  mekoUrl?: string;
  mekoDatapackId?: string;
}

export function userConfigFile(): string {
  return path.join(operonHome(), "config.json");
}

export function readUserGlobalConfig(): UserGlobalConfig {
  try {
    const p = userConfigFile();
    if (!fs.existsSync(p)) return {};
    return JSON.parse(fs.readFileSync(p, "utf8")) as UserGlobalConfig;
  } catch {
    return {};
  }
}

export function writeUserGlobalConfig(cfg: UserGlobalConfig): void {
  const p = userConfigFile();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(cfg, null, 2) + "\n");
}

export function clearUserGlobalConfig(): void {
  const p = userConfigFile();
  if (fs.existsSync(p)) {
    fs.unlinkSync(p);
  }
}
