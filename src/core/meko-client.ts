import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Invariant } from "../types/okf.js";
import type { Project } from "./local-store.js";
import { readUserGlobalConfig } from "./user-config.js";

export const DEFAULT_MEKO_URL = "https://mcp.mekodata.ai/mcp";

export interface MekoConfig {
  url: string;
  token: string;
  datapackId?: string;
}

export interface MekoAddResult {
  results: Array<{
    id: string;
    memory: string;
    event: string;
  }>;
}

export interface MekoSearchHit {
  id: string;
  memory: string;
  score: number;
  raw_similarity_score?: number;
  created_at?: string;
  agent_id?: string;
}

export interface MekoSearchResult {
  results: MekoSearchHit[];
}

interface MekoJsonRpcEnvelope {
  jsonrpc: "2.0";
  id: number;
  result?: {
    content?: Array<{ type: string; text: string }>;
  };
  error?: {
    code: number;
    message: string;
    detail?: string;
  };
}

function readEnvVars(filePath: string): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    if (!fs.existsSync(filePath)) return out;
    const content = fs.readFileSync(filePath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const [key, ...rest] = trimmed.split("=");
      const k = key.trim();
      const val = rest.join("=").trim().replace(/^["']|["']$/g, "");
      if (k && val) out[k] = val;
    }
  } catch {
    /* ignore unreadable env file */
  }
  return out;
}

/** Resolves Meko L2 configuration from environment variables, .env files, or `.operon/config.json`. */
export function resolveMekoConfig(project?: Project | null): MekoConfig | null {
  let token =
    process.env.OPERON_MEKO_TOKEN?.trim() ||
    process.env.MEKO_API_TOKEN?.trim() ||
    process.env.MEKO_API_KEY?.trim() ||
    process.env.MEKO_TOKEN?.trim() ||
    "";
  let url = process.env.OPERON_MEKO_URL?.trim() || process.env.MEKO_URL?.trim() || "";
  let datapackId =
    process.env.OPERON_MEKO_DATAPACK_ID?.trim() || process.env.MEKO_DATAPACK_ID?.trim() || "";

  const searchDirs = [project?.root, process.cwd()].filter(Boolean) as string[];
  for (const dir of searchDirs) {
    for (const envName of [".env.local", ".env"]) {
      const vars = readEnvVars(path.join(dir, envName));
      if (!token) {
        token =
          vars.OPERON_MEKO_TOKEN ||
          vars.MEKO_API_TOKEN ||
          vars.MEKO_API_KEY ||
          vars.MEKO_TOKEN ||
          "";
      }
      if (!url) url = vars.OPERON_MEKO_URL || vars.MEKO_URL || "";
      if (!datapackId) datapackId = vars.OPERON_MEKO_DATAPACK_ID || vars.MEKO_DATAPACK_ID || "";
    }
  }

  if (!token && project?.config.meko?.token) token = project.config.meko.token;
  if (!url && project?.config.meko?.url) url = project.config.meko.url;
  if (!datapackId && project?.config.meko?.datapackId) datapackId = project.config.meko.datapackId;

  const userCfg = readUserGlobalConfig();
  if (!token && userCfg.mekoToken) token = userCfg.mekoToken;
  if (!url && userCfg.mekoUrl) url = userCfg.mekoUrl;
  if (!datapackId && userCfg.mekoDatapackId) datapackId = userCfg.mekoDatapackId;

  if (!token) return null;
  return {
    url: url || DEFAULT_MEKO_URL,
    token,
    ...(datapackId ? { datapackId } : {}),
  };
}

/** Converts an arbitrary session string into a valid RFC 4122 UUID v4 required by Meko's Langfuse tracer. */
export function toConversationUuid(seed?: string): string {
  if (!seed) return crypto.randomUUID();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(seed)) {
    return seed.toLowerCase();
  }
  const hex = crypto.createHash("sha256").update(seed).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** Parses either direct JSON-RPC or FastMCP `text/event-stream` (`data: {...}`) responses. */
function parseMcpEnvelope(rawBody: string): MekoJsonRpcEnvelope {
  const trimmed = rawBody.trim();
  if (trimmed.startsWith("{")) {
    return JSON.parse(trimmed) as MekoJsonRpcEnvelope;
  }
  const dataLines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).trim())
    .filter((l) => l.startsWith("{"));
  if (dataLines.length > 0) {
    return JSON.parse(dataLines[dataLines.length - 1]) as MekoJsonRpcEnvelope;
  }
  throw new Error("Unrecognized Meko MCP response format");
}

export class MekoClient {
  readonly url: string;
  private readonly token: string;
  private readonly datapackId?: string;
  private readonly timeoutMs: number;

  constructor(config: MekoConfig, timeoutMs = Number(process.env.OPERON_MEKO_TIMEOUT_MS) || 12000) {
    this.url = config.url || DEFAULT_MEKO_URL;
    this.token = config.token;
    this.datapackId = config.datapackId;
    this.timeoutMs = timeoutMs;
  }

  private async callTool<T>(name: string, args: Record<string, unknown>, retryOnTraceLimit = true): Promise<T> {
    const response = await fetch(this.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: {
          name,
          arguments: {
            ...args,
            ...(args.datapack_id ?? this.datapackId ? { datapack_id: args.datapack_id ?? this.datapackId } : {}),
          },
        },
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (response.status === 429) {
      throw new Error("[Meko Quota Exceeded] 1,000 query lifetime limit reached.");
    }

    if (!response.ok) {
      throw new Error(`[Meko HTTP Error] ${response.status}`);
    }

    const data = parseMcpEnvelope(await response.text());

    if (data.error) {
      // Langfuse 25-35 turn crash boundary (-32603): rotate conversation_id and retry once
      if (data.error.code === -32603 && retryOnTraceLimit) {
        return await this.callTool<T>(name, { ...args, conversation_id: crypto.randomUUID() }, false);
      }
      throw new Error(`[Meko MCP Error ${data.error.code}]: ${data.error.message}`);
    }

    const rawText = data.result?.content?.[0]?.text;
    if (!rawText) throw new Error("Empty response from Meko tool execution.");
    return JSON.parse(rawText) as T;
  }

  async memoryAdd(
    text: string,
    conversationId: string,
    opts: { agentId?: string; metadata?: Record<string, unknown> } = {},
  ): Promise<MekoAddResult> {
    return await this.callTool<MekoAddResult>("memory_add", {
      text,
      conversation_id: toConversationUuid(conversationId),
      agent_id: opts.agentId ?? "operon:cli",
      ...(opts.metadata ? { metadata: JSON.stringify(opts.metadata) } : {}),
    });
  }

  async memorySearch(query: string, conversationId: string, limit = 5): Promise<MekoSearchResult> {
    return await this.callTool<MekoSearchResult>("memory_search", {
      query,
      conversation_id: toConversationUuid(conversationId),
      limit,
    });
  }
}

/** Formats an Operon Invariant into a structured semantic fact for Meko L2 storage. */
export function formatInvariantForMeko(inv: Invariant): string {
  const reasonSuffix = inv.reason ? ` — Reason: ${inv.reason}` : "";
  return `[${inv.code}] (paths: ${inv.paths.join(", ")}) ${inv.rule}${reasonSuffix}`;
}

/** Converts a Meko semantic search hit back into a structured Operon Invariant for L1 promotion. */
export function parseMekoHitToInvariant(
  hit: MekoSearchHit,
  existing: Invariant[],
  fallbackPrompt: string,
): Invariant {
  const raw = hit.memory.trim();
  const scoreLabel = hit.score !== undefined ? ` (score ${hit.score.toFixed(2)})` : "";
  const promptTokens =
    `${fallbackPrompt} ${raw}`
      .toLowerCase()
      .match(/[a-z0-9]{4,}/g)
      ?.filter((w) => !["this", "that", "with", "from", "into", "when", "must", "requires", "should", "paths", "reason"].includes(w))
      .slice(0, 6) ?? [];

  // Case 1: Memory was originally formatted by Operon: "[CODE-01] (paths: ...) rule — Reason: ..."
  const structuredMatch = /^\[([A-Z0-9-]+)\]\s*(?:\(paths:\s*([^)]+)\)\s*)?(.+)$/i.exec(raw);
  if (structuredMatch) {
    const [, rawCode, rawPaths, rest] = structuredMatch;
    const [rulePart, reasonPart] = rest.split(/\s+—\s+Reason:\s+/i);
    const paths = rawPaths
      ? rawPaths
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean)
      : ["**"];
    const codeTokens = rawCode
      .split(/[^a-zA-Z0-9]+/)
      .map((t) => t.toLowerCase())
      .filter((t) => t.length >= 2);
    const allTokens = [...new Set([...codeTokens, ...promptTokens])];
    return {
      code: rawCode.toUpperCase(),
      trigger: allTokens.length ? `\\b(${allTokens.join("|")})\\b` : "",
      rule: rulePart.trim(),
      reason: reasonPart ? `${reasonPart.trim()} [Meko L2${scoreLabel}]` : `Recalled from Meko/YugabyteDB L2${scoreLabel}`,
      paths,
      author: hit.agent_id || "meko-l2",
      timestamp: hit.created_at ? Date.parse(hit.created_at) || Date.now() : Date.now(),
    };
  }

  // Case 2: General cross-project semantic memory from Meko/YugabyteDB
  const nums = existing
    .map((i) => (i.code.startsWith("MEKO-") ? Number.parseInt(i.code.slice(5), 10) : 0))
    .filter((n) => Number.isFinite(n));
  const nextNum = (nums.length ? Math.max(...nums) : 0) + 1;
  const code = `MEKO-${String(nextNum).padStart(2, "0")}`;

  return {
    code,
    trigger: promptTokens.length ? `\\b(${[...new Set(promptTokens)].join("|")})\\b` : "",
    rule: raw,
    reason: `Recalled from Meko/YugabyteDB L2${scoreLabel}`,
    paths: ["**"],
    author: hit.agent_id || "meko-l2",
    timestamp: hit.created_at ? Date.parse(hit.created_at) || Date.now() : Date.now(),
  };
}

/**
 * High-Impact Write-Behind: Persists an invariant to Meko/YugabyteDB L2.
 * Non-blocking / zero-risk: catches all network, quota, or auth errors cleanly.
 */
export async function persistInvariantToMeko(
  project: Project,
  inv: Invariant,
  sessionId?: string,
): Promise<{ persisted: boolean; id?: string }> {
  const cfg = resolveMekoConfig(project);
  if (!cfg) return { persisted: false };
  try {
    const client = new MekoClient(cfg);
    const res = await client.memoryAdd(formatInvariantForMeko(inv), sessionId ?? project.key, {
      agentId: `operon:${project.config.name}`,
      metadata: {
        code: inv.code,
        paths: inv.paths,
        author: inv.author,
        project: project.config.name,
      },
    });
    return { persisted: true, id: res.results?.[0]?.id };
  } catch {
    return { persisted: false };
  }
}

/**
 * High-Impact Read-Through: Queries Meko/YugabyteDB L2 on an L1 cache miss,
 * returning structured Invariants ready to be promoted into Convex L1.
 */
export async function recallInvariantsFromMeko(
  project: Project,
  query: string,
  existing: Invariant[],
  opts: { limit?: number; minScore?: number; sessionId?: string } = {},
): Promise<Invariant[]> {
  const cfg = resolveMekoConfig(project);
  if (!cfg || !query.trim()) return [];
  try {
    const client = new MekoClient(cfg);
    const res = await client.memorySearch(query, opts.sessionId ?? project.key, opts.limit ?? 3);
    const minScore = opts.minScore ?? 0.4;
    const seenCodes = new Set(existing.map((i) => i.code.toUpperCase()));
    const seenRules = new Set(existing.map((i) => i.rule.trim().toLowerCase()));
    const recalled: Invariant[] = [];
    const runningExisting = [...existing];

    for (const hit of res.results ?? []) {
      if ((hit.score ?? 0) < minScore) continue;
      const inv = parseMekoHitToInvariant(hit, runningExisting, query);
      if (seenCodes.has(inv.code.toUpperCase()) || seenRules.has(inv.rule.trim().toLowerCase())) {
        continue;
      }
      seenCodes.add(inv.code.toUpperCase());
      seenRules.add(inv.rule.trim().toLowerCase());
      runningExisting.push(inv);
      recalled.push(inv);
    }
    return recalled;
  } catch {
    return [];
  }
}
