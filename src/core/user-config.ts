import fs from "node:fs";
import path from "node:path";
import { operonHome } from "./paths.js";

export interface UserGlobalConfig {
  convexUrl?: string;
}

export function userConfigFile(): string {
  return path.join(operonHome(), "user-config.json");
}

function cleanupLegacyGlobalConfig(): UserGlobalConfig | null {
  try {
    const legacy = path.join(operonHome(), "config.json");
    if (!fs.existsSync(legacy)) return null;
    const parsed = JSON.parse(fs.readFileSync(legacy, "utf8")) as Record<string, unknown>;
    if (!("repoRoot" in parsed)) {
      fs.unlinkSync(legacy);
      return { convexUrl: typeof parsed.convexUrl === "string" ? parsed.convexUrl : undefined };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function readUserGlobalConfig(): UserGlobalConfig {
  try {
    const migrated = cleanupLegacyGlobalConfig();
    const p = userConfigFile();
    if (!fs.existsSync(p)) {
      if (migrated?.convexUrl) writeUserGlobalConfig(migrated);
      return migrated ?? {};
    }
    return JSON.parse(fs.readFileSync(p, "utf8")) as UserGlobalConfig;
  } catch {
    return {};
  }
}

export function writeUserGlobalConfig(cfg: UserGlobalConfig): void {
  cleanupLegacyGlobalConfig();
  const p = userConfigFile();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(cfg, null, 2) + "\n");
}

export function clearUserGlobalConfig(): void {
  cleanupLegacyGlobalConfig();
  const p = userConfigFile();
  if (fs.existsSync(p)) {
    fs.unlinkSync(p);
  }
}
