import { author, changedFiles, currentBranch, EMPTY_TREE, headSha, untrackedFiles } from "../core/git.js";
import { appendCheckpointToMemory, requireProject } from "../core/local-store.js";
import { isIgnoredSeamPath } from "../core/matching.js";
import { appendCheckpoint, closeSession, ensureSession } from "../core/sessions.js";
import { pushCheckpoint } from "../core/sync.js";

export async function checkpointCommand(message: string, opts: { close?: boolean }): Promise<number> {
  const project = requireProject();
  const { root, dir } = project;
  const branch = currentBranch(root);
  const me = author(root);
  const { session } = ensureSession(dir, branch, me, headSha(root));
  if (opts.close) closeSession(dir, branch, me, session.sessionId, message);
  else appendCheckpoint(dir, branch, me, session.sessionId, message);

  const base = session.baseSha ?? headSha(root) ?? EMPTY_TREE;
  let changed: string[] = [];
  try {
    changed = [...changedFiles(root, base).map((f) => f.path), ...untrackedFiles(root)];
  } catch {
    /* ignore unreachable base */
  }
  const touchedPaths = [...new Set(changed)].filter((p) => !isIgnoredSeamPath(p)).slice(0, 25);

  appendCheckpointToMemory(dir, {
    message,
    author: me,
    branch,
    session: session.sessionId,
    status: opts.close ? "closed" : "in-flight",
  });

  await pushCheckpoint(project, {
    sessionId: session.sessionId,
    branch,
    author: me,
    message,
    ...(session.task ? { task: session.task } : {}),
    touchedPaths,
    close: !!opts.close,
  });
  console.log(`${opts.close ? "Session closed" : "Checkpoint saved"} [${session.sessionId}@${branch} → .operon/MEMORY.md]: ${message}`);
  return 0;
}
