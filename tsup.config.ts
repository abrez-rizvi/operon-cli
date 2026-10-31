import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  clean: true,
  banner: { js: "#!/usr/bin/env node" },
  define: {
    // Baked-in default Convex deployment; override at runtime with OPERON_CONVEX_URL.
    __OPERON_CONVEX_URL__: JSON.stringify(process.env.OPERON_CONVEX_URL ?? "https://amiable-tern-911.convex.cloud"),
  },
});
