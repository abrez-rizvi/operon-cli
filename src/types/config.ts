import { z } from "zod";

export const CloudBinding = z.object({
  url: z.string(),
  projectId: z.string(),
  inviteCode: z.string(),
  projectToken: z.string(),
});
export type CloudBinding = z.infer<typeof CloudBinding>;

export const ProjectConfig = z.object({
  version: z.literal(1).default(1),
  name: z.string(),
  key: z.string(),
  repoRoot: z.string(),
  remote: z.string().nullable().default(null),
  createdAt: z.number(),
  cloud: CloudBinding.optional(),
  lastPullAt: z.number().optional(),
});
export type ProjectConfig = z.infer<typeof ProjectConfig>;
