import { context } from "esbuild";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const out = join(here, "dist");
const core = join(root, "dist", "index.js");
const serve = process.argv.includes("--serve");

if (!existsSync(core)) {
  console.error("dist/index.js is missing. Run `npm run build` first.");
  process.exit(1);
}

const { version } = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const { encode, toSvg } = await import(pathToFileURL(core).href);

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

const localCore = {
  name: "local-core",
  setup(build) {
    build.onResolve({ filter: /^qr-zero$/ }, () => ({ path: core }));
    build.onEnd(async (result) => {
      if (result.errors.length) return;
      await copyFile(join(here, "index.html"), join(out, "index.html"));
      await writeFile(join(out, "favicon.svg"), toSvg(encode("qr-zero", "L"), { margin: 1 }));
    });
  },
};

const ctx = await context({
  entryPoints: { main: join(here, "src", "main.ts"), styles: join(here, "styles.css") },
  outdir: out,
  bundle: true,
  format: "esm",
  target: "es2020",
  minify: !serve,
  sourcemap: serve,
  define: { QR_ZERO_VERSION: JSON.stringify(version) },
  plugins: [localCore],
  logLevel: "info",
});

if (serve) {
  await ctx.watch();
  await ctx.serve({ servedir: out, port: Number(process.env.PORT) || 5173 });
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
