import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

/** Root of Operon's local state. Override with OPERON_HOME (used by smoke tests). */
export function operonHome(): string {
  return process.env.OPERON_HOME ?? path.join(userHome(), ".operon");
}

/** User home used for harness detection. Override with OPERON_USER_HOME (smoke tests). */
export function userHome(): string {
  return process.env.OPERON_USER_HOME ?? os.homedir();
}

export const packsDir = () => path.join(operonHome(), "packs");
export const projectsDir = () => path.join(operonHome(), "projects");

/** Expands a leading "~/" against userHome(). */
export function expandHome(p: string): string {
  return p.startsWith("~/") ? path.join(userHome(), p.slice(2)) : p;
}

/** Converts OS paths to POSIX-style for glob matching & display. */
export const toPosix = (p: string) => p.split(path.sep).join("/");

export const HARDCODED_DEFAULT_PACK_DIR = "D:\\MAIN\\operon";

let cachedTemplates: string | undefined;
/** Locates the bundled `templates/` dir (works from dist/ and src/). */
export function templatesDir(): string {
  if (cachedTemplates) return cachedTemplates;
  if (process.env.OPERON_TEMPLATES_DIR && fs.existsSync(process.env.OPERON_TEMPLATES_DIR)) {
    return (cachedTemplates = process.env.OPERON_TEMPLATES_DIR);
  }
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 5; i++) {
    const candidate = path.join(dir, "templates");
    if (fs.existsSync(path.join(dir, "package.json")) && fs.existsSync(candidate)) {
      return (cachedTemplates = candidate);
    }
    dir = path.dirname(dir);
  }
  if (fs.existsSync(HARDCODED_DEFAULT_PACK_DIR)) {
    return (cachedTemplates = HARDCODED_DEFAULT_PACK_DIR);
  }
  throw new Error("Operon templates directory not found");
}
