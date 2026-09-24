#!/usr/bin/env bash
# Pack the package, install the tarball into a throwaway project and check
# that both `import` (ESM) and `require` (CJS) resolve and work, that the
# bundled type declarations resolve under TypeScript's node16 resolution,
# and that the `qr-zero` bin runs.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d "${TMPDIR:-/tmp}/qr-zero-pack.XXXXXX")"
trap 'rm -rf "$tmp"' EXIT

tarball="$(cd "$root" && npm pack --silent --pack-destination "$tmp" | tail -n 1)"
echo "packed: $tarball"
tar -tzf "$tmp/$tarball" | sed 's/^/  /'

cd "$tmp"
npm init -y >/dev/null
npm install --silent --no-audit --no-fund "./$tarball" "typescript@$(node -p "require('$root/node_modules/typescript/package.json').version")"

cat > esm.mjs <<'JS'
import { encode, toSvg, toDataURL, toString, MAX_BYTES, QrTooLongError } from "qr-zero";
const qr = encode("https://github.com/fadyehabamer/qr-zero", { ecLevel: "Q" });
if (qr.version !== 4 || !toSvg(qr).startsWith("<svg") || !toDataURL(qr).startsWith("data:image/svg+xml")) throw new Error("bad ESM output");
if (!toString(qr).includes("█") || MAX_BYTES.L !== 2953) throw new Error("bad ESM output");
try { encode("x".repeat(3000), "L"); throw new Error("no throw"); } catch (e) { if (!(e instanceof QrTooLongError)) throw e; }
console.log("ESM import ok: version", qr.version, "size", qr.size);
JS

cat > cjs.cjs <<'JS'
const { encode, toSvg, QrTooLongError } = require("qr-zero");
const qr = encode("مرحبا 👋", "H");
if (!toSvg(qr, { title: "hi" }).includes("<title>hi</title>")) throw new Error("bad CJS output");
if (typeof QrTooLongError !== "function") throw new Error("bad CJS exports");
console.log("CJS require ok: version", qr.version, "bytes", qr.bytes);
JS

cat > types.mts <<'TS'
import { encode, toSvg, type QrCode, type EcLevel } from "qr-zero";
const ec: EcLevel = "M";
const qr: QrCode = encode("typed", ec);
const svg: string = toSvg(qr, { margin: 2, light: null });
console.log(svg.length);
TS
cat > types.cts <<'TS'
import qrZero = require("qr-zero");
const qr: qrZero.QrCode = qrZero.encode("typed", "L");
console.log(qr.size);
TS

node esm.mjs
node cjs.cjs
npx tsc --noEmit --strict --module node16 --moduleResolution node16 types.mts types.cts
echo "TypeScript (node16, ESM + CJS) types ok"

svg="$(./node_modules/.bin/qr-zero "HELLO 123" --ec Q --svg -)"
case "$svg" in "<svg"*"</svg>") ;; *) echo "bad CLI SVG output" >&2; exit 1 ;; esac
term="$(./node_modules/.bin/qr-zero "https://github.com/fadyehabamer/qr-zero" --margin 1)"
sed -n 1,3p <<<"$term"
echo "CLI bin ok: $(./node_modules/.bin/qr-zero --version)"
