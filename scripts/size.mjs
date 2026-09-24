// Report the minified + gzipped size of the published bundle, both for the
// whole API and for a typical `encode` + `toSvg` import.
import { build } from "esbuild";
import { gzipSync, brotliCompressSync } from "node:zlib";

async function measure(label, contents) {
  const result = await build({
    stdin: { contents, resolveDir: process.cwd(), loader: "js" },
    bundle: true,
    minify: true,
    format: "esm",
    target: "es2020",
    write: false,
    logLevel: "silent",
  });
  const code = result.outputFiles[0].contents;
  const kb = (n) => `${(n / 1024).toFixed(2)} kB`;
  console.log(
    `${label.padEnd(24)} min ${kb(code.length).padStart(9)}  gzip ${kb(gzipSync(code, { level: 9 }).length).padStart(8)}  brotli ${kb(brotliCompressSync(code).length).padStart(8)}`,
  );
}

await measure("full API", `export * from "./dist/index.js";`);
await measure("encode + toSvg", `export { encode, toSvg } from "./dist/index.js";`);
await measure("encode only", `export { encode } from "./dist/index.js";`);
