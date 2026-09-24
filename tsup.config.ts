import { defineConfig, type Options } from "tsup";
import type { Plugin } from "esbuild";

/**
 * Keep the CLI and the React entry thin: they import the core from the
 * sibling `index` bundle at run time instead of inlining a second copy.
 */
const coreAsSibling = (file: string): Plugin => ({
  name: "core-as-sibling",
  setup(build) {
    build.onResolve({ filter: /^\.\/index$/ }, () => ({ path: file, external: true }));
  },
});

const shared: Options = { target: "es2020", treeshake: true, sourcemap: false };

export default defineConfig([
  { ...shared, entry: ["src/index.ts"], format: ["esm", "cjs"], dts: true, clean: true },
  { ...shared, entry: ["src/cli.ts"], format: "esm", esbuildPlugins: [coreAsSibling("./index.js")] },
]);
