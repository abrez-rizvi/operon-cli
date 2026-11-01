import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  clean: true,
  banner: { js: "#!/usr/bin/env node" },
  define: {
    // Optional baked-in Convex deployment override via environment variable during build.
    __OPERON_CONVEX_URL__: JSON.stringify(process.env.OPERON_CONVEX_URL ?? ""),
  },
});
