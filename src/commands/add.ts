import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cancel, confirm, intro, isCancel, log, outro, select, text } from "@clack/prompts";
import pc from "picocolors";
import { OperonError } from "../core/local-store.js";
import { agentConversionPrompt, ingestDirectoryIntoPack, packDir, toSlug } from "../core/packs.js";
import { isInteractive } from "../core/ui.js";
import { validateOkf } from "../tools/okf-validator.js";

export interface AddOptions {
  name?: string;
  convert?: boolean;
  raw?: boolean;
  force?: boolean;
}

interface ParsedRemote {
  cloneUrl: string;
  branch?: string;
  subdir?: string;
  defaultName: string;
}

/** Parses GitHub/Git URLs including `/tree/<branch>/<subdir>` URLs. */
export function parseGitSource(source: string): ParsedRemote | null {
  const trimmed = source.trim().replace(/\/+$/, "");
  const treeMatch = /^(https?:\/\/github\.com\/[^/]+\/[^/]+?)(?:\.git)?\/tree\/([^/]+)(?:\/(.+))?$/i.exec(trimmed);
  if (treeMatch) {
    const [, baseUrl, branch, subdir] = treeMatch;
    const defaultName = toSlug(subdir ? path.posix.basename(subdir) : path.posix.basename(baseUrl));
    return { cloneUrl: `${baseUrl}.git`, branch, subdir, defaultName };
  }
  if (/^(https?:\/\/|git@|ssh:\/\/|file:\/\/)/i.test(trimmed) || /\.git$/i.test(trimmed)) {
    const base = path.posix.basename(trimmed.replace(/\.git$/i, ""));
    return { cloneUrl: trimmed, defaultName: toSlug(base) };
  }
  return null;
}

export async function addCommand(source: string, opts: AddOptions = {}): Promise<number> {
  const interactive = isInteractive() && !opts.name && !opts.convert && !opts.raw;
  if (interactive) intro(pc.bold("Operon Skill Ingestion"));
  else console.log(pc.bold(`Operon Skill Ingestion · ${source}`));

  const remote = parseGitSource(source);
  let tempDir: string | null = null;
  let stageRoot: string;
  let defaultPackName: string;

  try {
    if (remote) {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "operon-add-"));
      const args = ["clone", "--depth", "1", ...(remote.branch ? ["--branch", remote.branch] : []), remote.cloneUrl, tempDir];
      try {
        execFileSync("git", args, { stdio: ["ignore", "pipe", "pipe"] });
      } catch (err) {
        throw new OperonError(`Failed to clone ${remote.cloneUrl}: ${err instanceof Error ? err.message : String(err)}`);
      }
      stageRoot = remote.subdir ? path.join(tempDir, remote.subdir) : tempDir;
      if (!fs.existsSync(stageRoot)) {
        throw new OperonError(`Subdirectory "${remote.subdir}" not found in ${remote.cloneUrl}`);
      }
      defaultPackName = remote.defaultName;
    } else {
      stageRoot = path.resolve(source);
      if (!fs.existsSync(stageRoot) || !fs.statSync(stageRoot).isDirectory()) {
        throw new OperonError(`Source directory not found: ${source}`);
      }
      defaultPackName = toSlug(path.basename(stageRoot));
      if (defaultPackName === "operon") defaultPackName = "default";
    }

    // Stage into a temporary pack first to count discovered items
    const stagingPack = fs.mkdtempSync(path.join(os.tmpdir(), "operon-pack-"));
    const { skills, workflows } = ingestDirectoryIntoPack(stageRoot, stagingPack);
    const total = skills + workflows;
    if (total === 0) {
      fs.rmSync(stagingPack, { recursive: true, force: true });
      throw new OperonError(`No Markdown skills or workflows found in ${source}`);
    }

    if (interactive) {
      log.success(`Discovered ${skills} skill(s) and ${workflows} workflow(s)`);
    }

    let chosenName = toSlug(opts.name ?? defaultPackName);
    if (interactive) {
      const nameResp = await text({
        message: "Assign a pack name:",
        placeholder: defaultPackName,
        defaultValue: defaultPackName,
      });
      if (isCancel(nameResp)) {
        cancel("Cancelled.");
        fs.rmSync(stagingPack, { recursive: true, force: true });
        return 1;
      }
      chosenName = toSlug(nameResp || defaultPackName);
    }

    let dest = packDir(chosenName);
    if (fs.existsSync(dest) && !opts.force) {
      if (interactive) {
        const action = await select({
          message: `Pack "${chosenName}" already exists. How would you like to proceed?`,
          options: [
            { value: "overwrite", label: `Overwrite "${chosenName}"` },
            { value: "rename", label: "Save under a new pack name" },
          ],
        });
        if (isCancel(action)) {
          cancel("Cancelled.");
          fs.rmSync(stagingPack, { recursive: true, force: true });
          return 1;
        }
        if (action === "rename") {
          const renamed = await text({
            message: "New pack name:",
            defaultValue: `${chosenName}-2`,
          });
          if (isCancel(renamed)) {
            cancel("Cancelled.");
            fs.rmSync(stagingPack, { recursive: true, force: true });
            return 1;
          }
          chosenName = toSlug(renamed || `${chosenName}-2`);
          dest = packDir(chosenName);
        }
      }
    }

    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.cpSync(stagingPack, dest, { recursive: true, force: true });
    fs.rmSync(stagingPack, { recursive: true, force: true });

    let wantConvert = !!opts.convert;
    if (interactive && !opts.raw) {
      const { issues } = validateOkf(dest);
      if (issues.length > 0) {
        const convertResp = await confirm({
          message: `Convert to OKF v0.3 format? (${issues.length} file(s) need frontmatter normalization)`,
          initialValue: true,
        });
        if (!isCancel(convertResp)) wantConvert = convertResp;
      }
    }

    const summary = `Staged ${skills} skill(s) and ${workflows} workflow(s) into ${dest}`;
    if (interactive) outro(pc.green(summary));
    else console.log(`${pc.green("✔")} ${summary}`);

    if (wantConvert) {
      console.log("\n" + agentConversionPrompt(dest));
    }
    return 0;
  } finally {
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
