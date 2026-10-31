import path from "node:path";
import { cancel, groupMultiselect, intro, isCancel, log, outro, text } from "@clack/prompts";
import pc from "picocolors";
import { resolveConvexUrl } from "../core/convex-client.js";
import { armLocalHarnesses } from "../core/harness-scanner.js";
import { remoteToHttps, remoteUrl } from "../core/git.js";
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
  listPackItems,
  listPacks,
  seedProjectBasics,
} from "../core/packs.js";
import { bindAndSyncProject } from "../core/sync.js";
import { isInteractive, printArmResults } from "../core/ui.js";
import { validateOkf } from "../tools/okf-validator.js";
import { addCommand } from "./add.js";

export interface InitOptions {
  local?: boolean;
  yes?: boolean;
  pack?: string;
}

const ACTION_IMPORT_GH = "__action:import-github";
const ACTION_IMPORT_DIR = "__action:import-dir";

export async function initCommand(nameArg: string | undefined, opts: InitOptions = {}): Promise<number> {
  const root = requireRepo();
  const existing = loadProject();
  if (existing) {
    console.log(`Already initialized: ${pc.bold(existing.config.name)} ${pc.dim(existing.dir)}`);
    printArmResults(armLocalHarnesses(root));
    return 0;
  }

  ensureDefaultPack();
  const key = projectKey(root);
  const dir = projectDirFor(key);
  const defaultName = nameArg ?? path.basename(root);
  const detectedRemote = remoteUrl(root);
  const interactive = isInteractive() && !opts.local && !opts.yes && !opts.pack;

  let name = defaultName;
  let remote = detectedRemote;
  let equippedCount = 0;

  if (interactive) {
    intro(pc.bold("Operon Project Initialization"));
    const nameInput = await text({
      message: "Project name:",
      placeholder: defaultName,
      defaultValue: defaultName,
    });
    if (isCancel(nameInput)) {
      cancel("Initialization cancelled.");
      return 1;
    }
    name = (nameInput || defaultName).trim();

    if (detectedRemote) {
      log.info(`Auto-detected repository: ${pc.cyan(remoteToHttps(detectedRemote))}`);
    } else {
      const repoInput = await text({
        message: "GitHub repository URL (optional, press Enter to skip):",
        placeholder: "https://github.com/acme/project",
        defaultValue: "",
      });
      if (isCancel(repoInput)) {
        cancel("Initialization cancelled.");
        return 1;
      }
      if (repoInput.trim()) remote = repoInput.trim();
    }

    // Build pack-grouped multi-select options
    const buildGroupedOptions = () => {
      const groups: Record<string, { value: string; label: string; hint?: string }[]> = {};
      const initialValues: string[] = [];
      for (const pack of listPacks()) {
        const items = listPackItems(pack);
        if (!items.length) continue;
        groups[`[${pack}]`] = items.map((item) => {
          const val = `${pack}:${item.relCopyPath}`;
          if (pack === DEFAULT_PACK) initialValues.push(val);
          return {
            value: val,
            label: `${item.title} (${item.displayPath})`,
            hint: item.kind,
          };
        });
      }
      groups["[Actions]"] = [
        { value: ACTION_IMPORT_GH, label: "+ Import another GitHub repository..." },
        { value: ACTION_IMPORT_DIR, label: "+ Import from local directory..." },
      ];
      return { groups, initialValues };
    };

    let { groups, initialValues } = buildGroupedOptions();
    const firstChoice = await groupMultiselect({
      message: "Select skills & playbooks to equip for this project:",
      options: groups,
      initialValues,
      required: false,
    });
    if (isCancel(firstChoice)) {
      cancel("Initialization cancelled.");
      return 1;
    }
    let selected: string[] = firstChoice;

    // Handle on-the-fly import actions
    while (selected.includes(ACTION_IMPORT_GH) || selected.includes(ACTION_IMPORT_DIR)) {
      const isGh = selected.includes(ACTION_IMPORT_GH);
      const src = await text({
        message: isGh ? "GitHub repository URL to import:" : "Local directory path to import:",
        placeholder: isGh ? "https://github.com/anthropics/claude-code-skills" : "./my-rules",
      });
      if (!isCancel(src) && src.trim()) {
        await addCommand(src.trim());
      }
      ({ groups, initialValues } = buildGroupedOptions());
      const nextSelected = await groupMultiselect({
        message: "Select skills & playbooks to equip for this project:",
        options: groups,
        initialValues: selected.filter((v) => !v.startsWith("__action:")),
        required: false,
      });
      if (isCancel(nextSelected)) {
        cancel("Initialization cancelled.");
        return 1;
      }
      selected = nextSelected;
    }

    for (const entry of selected) {
      if (entry.startsWith("__action:")) continue;
      const idx = entry.indexOf(":");
      const pack = entry.slice(0, idx);
      const relPath = entry.slice(idx + 1);
      copyEntity(pack, relPath, dir);
      equippedCount++;
    }
  } else {
    equippedCount += copyWholePack(DEFAULT_PACK, dir);
    if (opts.pack && opts.pack !== DEFAULT_PACK) {
      equippedCount += copyWholePack(opts.pack, dir);
    }
  }

  seedProjectBasics(dir);
  const config = { version: 1 as const, name, key, repoRoot: root, remote, createdAt: Date.now() };
  saveConfig(dir, config);
  const project: Project = { root, key, dir, config };

  // Bind to Convex automatically if URL is configured and --local was not passed
  const url = !opts.local ? resolveConvexUrl(project) : null;
  if (url) {
    try {
      await bindAndSyncProject(project, url);
    } catch {
      /* offline during init is fine; user can run `operon share` or `operon sync` later */
    }
  }

  const msg = `${equippedCount} skill(s)/workflow(s) and core guardrails equipped to ${pc.bold(name)}!`;
  if (interactive) outro(pc.green(`✔ ${msg}`));
  else console.log(`${pc.green("✔")} Initialized ${pc.bold(name)} with ${equippedCount} skills/workflows ${pc.dim(dir)}`);

  printArmResults(armLocalHarnesses(root));

  const { issues } = validateOkf(dir);
  if (issues.length > 0) {
    console.log(pc.yellow(`\n! ${issues.length} imported file(s) need OKF v0.3 frontmatter normalization:`));
    console.log(agentConversionPrompt(dir));
  }
  return 0;
}
