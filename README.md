# qr-zero

[![CI](https://github.com/fadyehabamer/qr-zero/actions/workflows/ci.yml/badge.svg)](https://github.com/fadyehabamer/qr-zero/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/qr-zero.svg)](https://www.npmjs.com/package/qr-zero)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

A zero-dependency QR code encoder for JavaScript and TypeScript.

- **No dependencies.** The whole encoder fits in one small file: bit stream, Reed–Solomon over GF(256), block interleaving, all eight masks and the penalty scoring that picks between them.
- **Small.** 3.7 kB minified + gzipped for the full API, 2.9 kB if you only import `encode` ([details](#bundle-size)).
- **Complete byte mode.** Versions 1–40 and error-correction levels L, M, Q and H. UTF-8 in, so Arabic, CJK and emoji work.
- **Runs anywhere.** Browsers, Node 18+, Deno, Bun, workers and edge runtimes. Ships ESM, CJS and TypeScript types.
- **Tested against real tools.** Every version/EC combination is decoded with [jsQR](https://github.com/cozmo/jsQR) and compared module by module with the [`qrcode`](https://github.com/soldair/node-qrcode) package.

The output is a plain boolean matrix. You can use the SVG, data-URI or terminal renderers that come with it, or draw the matrix to a canvas yourself.

## Install

```sh
npm install qr-zero
```

## Usage

```ts
import { encode, toSvg } from "qr-zero";

const qr = encode("https://github.com/fadyehabamer/qr-zero");
const svg = toSvg(qr, { title: "Link to the qr-zero repository" });
// <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 37 37" ...>…</svg>
```

CommonJS works too:

```js
const { encode, toSvg } = require("qr-zero");
```

### Error-correction level

```ts
encode(text);                        // "M" (the default, ~15 % recovery)
encode(text, "H");                   // shorthand
encode(text, { ecLevel: "Q" });      // options form
```

| Level | Recovers about | Max bytes (version 40) |
| ----- | -------------- | ---------------------- |
| `L`   | 7 %            | 2953                   |
| `M`   | 15 %           | 2331                   |
| `Q`   | 25 %           | 1663                   |
| `H`   | 30 %           | 1273                   |

### In the browser: `<img src>` via a data URI

```ts
import { encode, toDataURL } from "qr-zero";

const img = document.querySelector("img")!;
img.src = toDataURL(encode(location.href), { moduleSize: 6 });
img.alt = "QR code for this page";
```

`toDataURL` returns `data:image/svg+xml;charset=utf-8,…`. It percent-encodes the SVG, so it is safe for any text, and you can use it in CSS `url()` as well.

### React

```tsx
import { useMemo } from "react";
import { encode, toDataURL, type EcLevel } from "qr-zero";

export function QrCode({ value, size = 192, ecLevel = "M" }: {
  value: string;
  size?: number;
  ecLevel?: EcLevel;
}) {
  const src = useMemo(() => toDataURL(encode(value, ecLevel)), [value, ecLevel]);
  return <img src={src} width={size} height={size} alt={`QR code: ${value}`} />;
}
```

If you prefer inline SVG, which you can style with CSS and which needs no image decode:

```tsx
const svg = useMemo(
  () => toSvg(encode(value), { title: `QR code: ${value}`, dark: "currentColor", light: null }),
  [value],
);
return <span dangerouslySetInnerHTML={{ __html: svg }} />;
```

`toSvg` escapes the title and colour values, so this is safe with user-supplied text.

### Canvas

```ts
const qr = encode("hello");
const scale = 8, margin = 4;
const px = (qr.size + margin * 2) * scale;
canvas.width = canvas.height = px;
const ctx = canvas.getContext("2d")!;
ctx.fillStyle = "#fff";
ctx.fillRect(0, 0, px, px);
ctx.fillStyle = "#000";
qr.modules.forEach((row, y) =>
  row.forEach((dark, x) => dark && ctx.fillRect((x + margin) * scale, (y + margin) * scale, scale, scale)),
);
```

### Terminal

```ts
import { encode, toString } from "qr-zero";
console.log(toString(encode("https://example.com"), { invert: true }));
```

Most terminals show light text on a dark background, so use `invert: true` there to get a code that scans.

### Handling payloads that are too long

```ts
import { encode, QrTooLongError, MAX_BYTES } from "qr-zero";

try {
  encode(hugeText, "H");
} catch (err) {
  if (err instanceof QrTooLongError) {
    console.log(`${err.bytes} bytes; level ${err.ecLevel} holds ${err.maxBytes}`);
  }
}
```

Limits count **UTF-8 bytes**, not characters. `"م"` takes 2 bytes, and most emoji take 4.

## API

### `encode(input, options?) → QrCode`

Encodes the input as the smallest QR symbol that fits.

- `input`: `string | Uint8Array`. A string is encoded as UTF-8. A `Uint8Array` is encoded exactly as given.
- `options`: an `EcLevel` string, or an object with these fields:
  - `ecLevel?: "L" | "M" | "Q" | "H"`: defaults to `"M"`.
  - `minVersion?: number`: the smallest version to use (1–40, default 1). It sets a floor, not a fixed version, so a longer payload still gets a bigger symbol. Use it to keep the size the same across payloads.
  - `mask?: number`: forces mask pattern 0–7. By default qr-zero tries all eight and keeps the one with the lowest ISO/IEC 18004 penalty score.

It throws `QrTooLongError` when the input is too long for a version-40 symbol, `RangeError` when an option is invalid, and `TypeError` when the input is neither a string nor a `Uint8Array`.

```ts
interface QrCode {
  modules: boolean[][]; // modules[y][x], true = dark; no quiet zone
  size: number;         // modules per side: version * 4 + 17
  version: number;      // 1–40
  ecLevel: EcLevel;
  mask: number;         // 0–7
  bytes: number;        // payload length in bytes
}
```

### `toSvg(qr, options?) → string`

Returns a standalone SVG. All dark modules go into one `<path>` made of horizontal runs, drawn inside a `viewBox`, so the SVG is small and scales cleanly.

| Option       | Default     | Description |
| ------------ | ----------- | ----------- |
| `margin`     | `4`         | Quiet zone in modules. The spec calls for 4. Use less only if the surrounding page already gives the code a light border. |
| `dark`       | `"#000000"` | Colour of the dark modules. Any CSS colour works, including `currentColor`. |
| `light`      | `"#ffffff"` | Background colour. Pass `null` or `"transparent"` to leave out the background. |
| `moduleSize` | `4`         | Pixels per module for the `width`/`height` attributes. The `viewBox` stays in module units. |
| `title`      | none        | Accessible name. Adds `role="img"`, `aria-label` and a `<title>` element. |

### `toDataURL(qr, options?) → string`

Returns `toSvg(qr, options)` as a percent-encoded `data:image/svg+xml` URI. It takes the same options as `toSvg`.

### `toString(qr, options?) → string`

Renders the symbol as text.

| Option   | Default    | Description |
| -------- | ---------- | ----------- |
| `margin` | `2`        | Quiet zone in modules. |
| `style`  | `"blocks"` | `"blocks"` packs two rows into each line using ▀ ▄ █. `"ascii"` uses `##` for each dark module, one row per line. |
| `invert` | `false`    | Swaps dark and light. Use it for dark-background terminals. |

### Capacity helpers

- `MAX_BYTES: Record<EcLevel, number>`: the most bytes a version-40 symbol holds at each level.
- `byteCapacity(version, ecLevel)`: the most bytes a given version holds.
- `dataCodewords(version, ecLevel)`: the data codewords left in a version after error correction.

### `QrTooLongError`

A subclass of `RangeError` with three fields: `bytes` (the input length), `ecLevel`, and `maxBytes` (the most that level could hold).

### Types

`EcLevel`, `EncodeOptions`, `QrCode`, `SvgOptions` and `TextOptions` are all exported.

## Limits and non-goals

- **Byte mode only.** qr-zero does not use numeric, alphanumeric or Kanji modes, and it does not split the input into mixed-mode segments. Any reader decodes the result, but a digits-only or `UPPERCASE` payload uses more space than an encoder that optimises segments would need. A 20-digit number, for example, takes 20 bytes where numeric mode would take about 8.5.
- **No ECI header.** Strings are written as UTF-8 without an ECI designator. The spec nominally treats byte mode as ISO-8859-1, but iOS and Android camera apps, ZXing and jsQR all detect UTF-8, and most encoders behave the same way. If you need another character set, encode it yourself and pass a `Uint8Array`.
- **No Micro QR, rMQR or structured append.**
- **Mask choice may differ from other encoders.** Every mask gives a valid symbol. qr-zero scores penalty rule 3 as the spec describes, and some libraries (including `qrcode`) score it differently, so for the same input they may pick a different mask.
- **Rendering stays minimal.** The package includes an SVG renderer and a text renderer and nothing more: no logos, rounded modules or PNG output. The boolean matrix lets you build those yourself.

## Bundle size

Measured with esbuild (minify, ES2020) on the built ESM output, using `npm run size`:

| Import                            | Minified | Min + gzip | Min + brotli |
| --------------------------------- | -------- | ---------- | ------------ |
| Everything                        | 8.16 kB  | **3.72 kB** | 3.38 kB     |
| `encode` + `toSvg`                | 7.44 kB  | 3.43 kB    | 3.11 kB      |
| `encode` only                     | 6.46 kB  | 2.92 kB    | 2.65 kB      |

The package sets `"sideEffects": false`, so bundlers drop the renderers you don't import. The npm tarball is about 9 kB.

On an Apple-silicon laptop under Node 24, one `encode` call takes about 0.3 ms for a 40-byte URL, 5 ms for 1 kB, and 10 ms for a full 2953-byte version-40 symbol.

## Testing

```sh
npm test            # node:test via tsx
npm run typecheck
npm run check:pack  # build, npm pack, install the tarball, import + require it
```

The suite (55 tests) covers:

- **GF(256) and Reed–Solomon**: checked against the spec's generator polynomials and worked examples.
- **Capacities, format bits and version bits**: capacities for every version/EC boundary, the `MAX_BYTES` limit and `QrTooLongError`; all 32 format words and the version words, read back out of encoded matrices.
- **End-to-end decoding**: every version 1–40 at every EC level, filled to capacity, is rasterised and decoded with **jsQR**, along with Arabic/emoji payloads and all eight masks. One combination, 23-L, is left out. jsQR 1.4.0 lists version 23's alignment centres as `[6, 30, 54, 74, 102]`, while the spec says 78, not 74. That bug makes jsQR fail on 23-L symbols from any encoder.
- **Reference comparison**: 240 symbols compared module by module with the **`qrcode`** package, using the same version and mask. This includes 23-L.

## Credits

- The encoder follows **ISO/IEC 18004:2015**.
- The table layout, the module-count formula and the alignment-position formula follow [Project Nayuki's QR Code generator library](https://www.nayuki.io/page/qr-code-generator-library) (MIT), which is an excellent reference implementation.
- The worked examples in [Thonky's QR Code Tutorial](https://www.thonky.com/qr-code-tutorial/) were used as test vectors.
- [jsQR](https://github.com/cozmo/jsQR) and [node-qrcode](https://github.com/soldair/node-qrcode) are used only as test oracles (dev dependencies).

"QR Code" is a registered trademark of DENSO WAVE INCORPORATED.

## License

[MIT](./LICENSE) © 2026 Fady Ehab Amer
