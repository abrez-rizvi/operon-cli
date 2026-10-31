import { author, currentBranch, headSha } from "../core/git.js";
import { appendCheckpointToMemory, requireProject } from "../core/local-store.js";
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

  appendCheckpointToMemory(dir, {
    message,
    author: me,
    branch,
    session: session.sessionId,
    status: opts.close ? "closed" : "in-flight",
  });

  await pushCheckpoint(project, { sessionId: session.sessionId, branch, author: me, message, close: !!opts.close });
  console.log(`${opts.close ? "Session closed" : "Checkpoint saved"} [${session.sessionId}@${branch} → .operon/MEMORY.md]: ${message}`);
  return 0;
}
