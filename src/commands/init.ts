import path from "node:path";
import { cancel, isCancel, log, multiselect, select, spinner, text } from "@clack/prompts";
import pc from "picocolors";
import { resolveConvexUrl } from "../core/convex-client.js";
import { remoteUrl } from "../core/git.js";
import { armLocalHarnesses } from "../core/harness-scanner.js";
import {
  loadProject,
  projectDirFor,
  projectKey,
  requireRepo,
  saveConfig,
  type Project,
} from "../core/local-store.js";
import {
  agentConversionPrompt,
  copyEntity,
  copyWholePack,
  DEFAULT_PACK,
  ensureDefaultPack,
  getAllPackItems,
  seedProjectBasics,
} from "../core/packs.js";
import { bindAndSyncProject } from "../core/sync.js";
import { isInteractive, printArmResults } from "../core/ui.js";
import { validateOkf } from "../tools/okf-validator.js";
import { addCommand, parseGitSource } from "./add.js";

export interface InitOptions {
  local?: boolean;
  yes?: boolean;
  pack?: string;
  skillsRepo?: string;
}

export interface SkillEquipResult {
  equippedCount: number;
  cancelled: boolean;
}

export async function promptSkillEquip(
  projectDir: string,
  opts: { skillsRepo?: string } = {},
): Promise<SkillEquipResult> {
  ensureDefaultPack();

  let importedPackName: string | null = null;

  if (opts.skillsRepo) {
    const s = spinner();
    s.start(`Fetching skills from ${opts.skillsRepo}...`);
    try {
      await addCommand(opts.skillsRepo, { raw: true, force: true });
      s.stop(pc.green(`✔ Imported skills from ${opts.skillsRepo}`));
      const parsed = parseGitSource(opts.skillsRepo);
      if (parsed) importedPackName = parsed.defaultName;
    } catch (err) {
      s.stop(pc.red(`Failed to fetch ${opts.skillsRepo}`));
      log.error(err instanceof Error ? err.message : String(err));
    }
  } else {
    const skillMethod = await select({
      message: "Equip skills & playbooks for this project:",
      options: [
        { value: "existing", label: "Choose existing skills", hint: "multi-select from built-in & local skills" },
        { value: "github", label: "Import from GitHub repo", hint: "optional repository URL for skill files" },
        { value: "defaults", label: "Use default skills", hint: "fast start with all 4 default skills" },
      ],
    });

    if (isCancel(skillMethod)) {
      return { equippedCount: 0, cancelled: true };
    }

    if (skillMethod === "defaults") {
      const count = copyWholePack(DEFAULT_PACK, projectDir);
      return { equippedCount: count, cancelled: false };
    }

    if (skillMethod === "github") {
      const repoUrl = await text({
        message: "GitHub repository URL for skill files (or press Enter to choose existing):",
        placeholder: "https://github.com/owner/repo or ./path/to/skills",
      });

      if (isCancel(repoUrl)) {
        return { equippedCount: 0, cancelled: true };
      }

      const trimmed = repoUrl.trim();
      if (trimmed) {
        const s = spinner();
        s.start(`Fetching skills from ${trimmed}...`);
        try {
          await addCommand(trimmed, { raw: true, force: true });
          s.stop(pc.green(`✔ Imported skills from ${trimmed}`));
          const parsed = parseGitSource(trimmed);
          if (parsed) importedPackName = parsed.defaultName;
        } catch (err) {
          s.stop(pc.red(`Failed to fetch ${trimmed}`));
          log.error(err instanceof Error ? err.message : String(err));
        }
      }
    }
  }

  // Load all available pack items (including newly imported)
  const allItems = getAllPackItems();
  if (allItems.length === 0) {
    const count = copyWholePack(DEFAULT_PACK, projectDir);
    return { equippedCount: count, cancelled: false };
  }

  const options = allItems.map((item) => {
    const packTag = item.pack !== DEFAULT_PACK ? `[${item.pack}] ` : "";
    return {
      value: `${item.pack}:${item.relCopyPath}`,
      label: `${packTag}${item.title} ${pc.dim(`(${item.displayPath})`)}`,
      hint: item.kind,
    };
  });

  // Pre-select: default pack items + newly imported items
  const initialValues = allItems
    .filter((item) => item.pack === DEFAULT_PACK || (importedPackName && item.pack === importedPackName))
    .map((item) => `${item.pack}:${item.relCopyPath}`);

  const selected = await multiselect({
    message: "Select skills & workflows to equip:",
    options,
    initialValues,
    required: false,
  });

  if (isCancel(selected)) {
    return { equippedCount: 0, cancelled: true };
  }

  let count = 0;
  for (const entry of selected) {
    const idx = entry.indexOf(":");
    if (idx === -1) continue;
    const pack = entry.slice(0, idx);
    const relPath = entry.slice(idx + 1);
    copyEntity(pack, relPath, projectDir);
    count++;
  }

  return { equippedCount: count, cancelled: false };
}

export async function initCommand(nameArg: string | undefined, opts: InitOptions = {}): Promise<number> {
  const root = requireRepo();
  const existing = loadProject(root);
  if (existing) {
    console.log(`Already initialized: ${pc.bold(existing.config.name)} ${pc.dim(existing.dir)}`);
    printArmResults(armLocalHarnesses(root));
    return 0;
  }

  ensureDefaultPack();
  const key = projectKey(root);
  const dir = projectDirFor(root);
  const name = (nameArg ?? path.basename(root)).trim() || "project";
  const remote = remoteUrl(root);

  let equippedCount = 0;
  const interactive = isInteractive() && !opts.yes && !opts.pack;

  if (interactive) {
    const result = await promptSkillEquip(dir, { skillsRepo: opts.skillsRepo });
    if (result.cancelled) {
      cancel("Initialization cancelled.");
      return 1;
    }
    equippedCount = result.equippedCount;
  } else {
    equippedCount = copyWholePack(DEFAULT_PACK, dir);
    if (opts.pack && opts.pack !== DEFAULT_PACK) {
      equippedCount += copyWholePack(opts.pack, dir);
    }
  }

  seedProjectBasics(dir);
  const config = { version: 1 as const, name, key, repoRoot: root, remote, createdAt: Date.now() };
  saveConfig(dir, config);
  const project: Project = { root, key, dir, config };

  const url = !opts.local ? resolveConvexUrl(project) : null;
  if (url) {
    try {
      await bindAndSyncProject(project, url);
    } catch {
      /* offline during init is fine; user can run `operon share` or `operon sync` later */
    }
  }

  console.log(`${pc.green("✔")} Initialized ${pc.bold(name)} with ${equippedCount} skills/workflows ${pc.dim(dir)}`);
  printArmResults(armLocalHarnesses(root));

  const { issues } = validateOkf(dir);
  if (issues.length > 0) {
    console.log(pc.yellow(`\n! ${issues.length} imported file(s) need OKF v0.3 frontmatter normalization:`));
    console.log(agentConversionPrompt(dir));
  }
  return 0;
}
