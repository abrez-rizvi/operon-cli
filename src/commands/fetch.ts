import path from "node:path";
import { api, createClient, resolveConvexUrl } from "../core/convex-client.js";
import { findEntity, listEntities } from "../core/entities.js";
import { OperonError, readInvariants, requireProject } from "../core/local-store.js";
import { timeAgo } from "../core/matching.js";
import { extractSection } from "../tools/heading-parser.js";

export async function fetchCommand(target?: string): Promise<number> {
  const project = requireProject();
  const { dir } = project;
  const raw = (target ?? "").trim();

  if (!raw || raw === "catalog" || raw === "list") {
    const invs = readInvariants(dir);
    const entities = listEntities(dir);
    console.log(`# Operon Knowledge & Skills Catalog (${project.config.name})`);

    console.log(`\n## Invariants (${invs.length})`);
    if (!invs.length) console.log("  (none)");
    for (const i of invs) {
      console.log(`- [${i.code}] ${i.rule} (${i.paths.join(", ")})`);
    }

    const groups: { kind: "knowledge" | "skill" | "workflow"; label: string }[] = [
      { kind: "knowledge", label: "Knowledge Docs" },
      { kind: "skill", label: "Skills" },
      { kind: "workflow", label: "Workflows" },
    ];
    for (const g of groups) {
      const items = entities.filter((e) => e.kind === g.kind);
      console.log(`\n## ${g.label} (${items.length})`);
      if (!items.length) {
        console.log("  (none)");
        continue;
      }
      for (const e of items) {
        const slugs = e.sections.map((s) => s.slug);
        const secLabel = slugs.length ? ` · sections: ${slugs.join(", ")}` : "";
        console.log(`- **${e.name}** (${e.title}): ${e.description}${secLabel}`);
      }
    }
    return 0;
  }

  const idx = raw.indexOf(":");
  const name = idx === -1 ? raw : raw.slice(0, idx);
  const heading = idx === -1 ? "" : raw.slice(idx + 1);

  if (name === "invariants") {
    const invs = readInvariants(dir);
    if (!invs.length) console.log("No invariants recorded yet.");
    for (const i of invs) {
      console.log(
        `- [${i.code}] ${i.rule}${i.reason ? ` — ${i.reason}` : ""} (${i.paths.join(", ")} · ${i.author} · ${timeAgo(i.timestamp)})`,
      );
    }
    return 0;
  }

  const entity = findEntity(dir, name);
  if (!entity) {
    // Fallback to Convex structured entities table if cloud is bound
    const url = resolveConvexUrl(project);
    if (url && project.config.cloud) {
      try {
        const remote = await createClient(url, 4000).query(api.entities.getSection, {
          projectId: project.config.cloud.projectId as any,
          name,
          ...(heading ? { section: heading } : {}),
        });
        if (remote) {
          if (!heading) {
            console.log(`# ${remote.title} (${remote.kind}: ${remote.name})`);
            if (remote.description) console.log(remote.description);
            console.log(`\nSections (fetch with \`operon fetch ${remote.name}:<section>\`):`);
            for (const h of remote.sections) {
              console.log(`${"  ".repeat(Math.max(0, h.level - 2))}- ${h.slug} — ${h.heading}`);
            }
            return 0;
          }
          if (remote.found && remote.sectionText) {
            console.log(remote.sectionText);
            return 0;
          }
          const slugs = remote.sections.map((s) => s.slug);
          throw new OperonError(`No section "${heading}" in ${remote.name}. Sections: ${slugs.join(", ")}`);
        }
      } catch (err) {
        if (err instanceof OperonError) throw err;
        /* ignore network error and fall through to local error */
      }
    }

    const names = listEntities(dir).map((e) => `${e.name} (${e.kind})`);
    throw new OperonError(`Unknown entity "${name}". Available: ${names.join(", ") || "none"}`);
  }

  if (!heading) {
    console.log(`# ${entity.title} (${entity.kind}: ${entity.name})`);
    if (entity.description) console.log(entity.description);
    console.log("\nSections (fetch with `operon fetch " + entity.name + ":<section>`):");
    for (const h of entity.sections) console.log(`${"  ".repeat(h.level - 2)}- ${h.slug} — ${h.text}`);
    return 0;
  }

  const result = extractSection(entity.body, heading);
  if (!result) {
    const slugs = entity.sections.map((h) => h.slug);
    throw new OperonError(`No section "${heading}" in ${path.basename(entity.file)}. Sections: ${slugs.join(", ")}`);
  }
  if ("ambiguous" in result) {
    throw new OperonError(`Section "${heading}" is ambiguous: ${result.ambiguous.map((h) => h.slug).join(", ")}`);
  }
  console.log(result.text);
  return 0;
}
