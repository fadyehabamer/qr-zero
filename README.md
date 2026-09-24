# qr-zero

[![CI](https://github.com/fadyehabamer/qr-zero/actions/workflows/ci.yml/badge.svg)](https://github.com/fadyehabamer/qr-zero/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/qr-zero.svg)](https://www.npmjs.com/package/qr-zero)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

A zero-dependency QR code encoder for JavaScript and TypeScript.

- **No dependencies.** The whole encoder is a few small files: bit stream, mode segmentation, Reed–Solomon over GF(256), block interleaving, all eight masks and the penalty scoring that picks between them.
- **Small.** 4.8 kB minified + gzipped for the full API, 3.7 kB if you only import `encode` ([details](#bundle-size)).
- **Numeric, alphanumeric and byte modes.** The input is split into mixed-mode segments automatically, using the split with the fewest bits, so digits and uppercase text produce smaller symbols. Versions 1–40 and error-correction levels L, M, Q and H. UTF-8 in, so Arabic, CJK and emoji work.
- **Runs anywhere.** Browsers, Node 18+, Deno, Bun, workers and edge runtimes. Ships ESM, CJS and TypeScript types.
- **Renderers included.** SVG, data URI, canvas, terminal text, a React component (`qr-zero/react`) and a `qr-zero` command-line tool.
- **Tested against real tools.** Every version/EC combination in every mode is decoded with [jsQR](https://github.com/cozmo/jsQR) and compared module by module with the [`qrcode`](https://github.com/soldair/node-qrcode) package.

The output is a plain boolean matrix. You can use the renderers that come with it or draw the matrix any way you like.

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

### Modes and segmentation

QR codes have denser encodings for some characters. Numeric mode packs 3 digits into 10 bits, and alphanumeric mode packs 2 characters from `0–9 A–Z space $ % * + - . / :` into 11 bits. Byte mode takes 8 bits for every byte. By default `encode` splits the input into segments of these modes and picks the split with the fewest bits:

```ts
encode("12345678901234567890").version;                      // 1  (byte mode alone: 2)
encode("HTTPS://GITHUB.COM/FADYEHABAMER/QR-ZERO", "Q").version; // 3  (byte mode alone: 4)

encode("https://example.com/track?id=12345678901234567890").segments;
// [{ mode: "byte", length: 29 }, { mode: "numeric", length: 20 }]
```

Uppercase URLs scan the same as lowercase ones: scheme and host names are case-insensitive, so `HTTPS://EXAMPLE.COM` works as a smaller alternative when the path is case-insensitive too.

The best split depends on the width of each segment's character-count field, which grows at versions 10 and 27, so qr-zero works out the split once for each of the three version ranges. The search is exact dynamic programming over (position, mode), not a heuristic.

To force a single mode, pass `mode`:

```ts
encode("0123456789", { mode: "byte" });     // same output as qr-zero 0.1
encode("HELLO", { mode: "alphanumeric" });
encode("hello", { mode: "numeric" });       // RangeError: not all digits
```

Kanji mode is not supported. Japanese text is encoded as UTF-8 in byte mode.

### ECI (UTF-8 declaration)

```ts
encode("مرحبا 👋", { eci: true });
```

By default qr-zero writes UTF-8 with no ECI header. The spec nominally treats byte mode as ISO-8859-1, but iOS and Android camera apps, ZXing and jsQR all detect UTF-8, and most encoders behave the same way. Setting `eci: true` starts the symbol with an ECI designator for UTF-8 (assignment 26). This costs 12 bits and makes the charset explicit for strict readers. Support varies, though: some older or embedded scanners ignore ECI, and a few show the designator as garbage or fail to read the code. The default is off, so leave it off unless you know your readers need it.

### In the browser: `<img src>` via a data URI

```ts
import { encode, toDataURL } from "qr-zero";

const img = document.querySelector("img")!;
img.src = toDataURL(encode(location.href), { moduleSize: 6 });
img.alt = "QR code for this page";
```

`toDataURL` returns `data:image/svg+xml;charset=utf-8,…`. It percent-encodes the SVG, so it is safe for any text, and you can use it in CSS `url()` as well.

### Canvas

```ts
import { encode, toCanvas } from "qr-zero";

const canvas = document.querySelector("canvas")!;
toCanvas(canvas, encode("hello"), { moduleSize: 8 });
```

`toCanvas` resizes the canvas to fit the symbol and draws it. It works with an `HTMLCanvasElement`, an `OffscreenCanvas` (in a worker, for example) or any object with a 2D context. It only touches the canvas you pass in, so importing qr-zero on a server or in a worker is safe. For sharp output on high-density screens, multiply `moduleSize` by `devicePixelRatio` and scale the canvas back down with CSS:

```ts
const qr = encode(location.href);
const dpr = Math.ceil(devicePixelRatio);
toCanvas(canvas, qr, { moduleSize: 4 * dpr });
canvas.style.width = canvas.style.height = `${canvas.width / dpr}px`;
```

For custom drawing, `toSvgPath(qr)` returns the dark modules as SVG path data in module units, which a canvas can fill directly: `ctx.fill(new Path2D(toSvgPath(qr)))`.

### React

```tsx
import { QrCode } from "qr-zero/react";

<QrCode value="https://example.com" ecLevel="Q" size={192} title="Link to example.com" />;
```

The component renders one inline `<svg>` with a single `<path>`, so you can style it with CSS and the browser needs no image decode. It works with server rendering and React 16.8 or later. React is an optional peer dependency: the `qr-zero` entry never imports it, and only `qr-zero/react` does.

| Prop      | Default     | Description |
| --------- | ----------- | ----------- |
| `value`   | (required)  | Text to encode. |
| `ecLevel` | `"M"`       | Error-correction level. |
| `size`    | `128`       | Width and height, as pixels or any CSS length (`"10rem"`, `"100%"`). |
| `title`   | none        | Accessible name. Adds `role="img"`, `aria-label` and a `<title>` element. |
| `margin`  | `4`         | Quiet zone in modules. |
| `dark`    | `"#000000"` | Colour of the dark modules. `"currentColor"` follows the text colour. |
| `light`   | `"#ffffff"` | Background. `null` or `"transparent"` leaves it out. |

Any other SVG attribute (`className`, `style`, `id`, `aria-*`) is passed through to the `<svg>`. Encoding is memoised on `value`, `ecLevel` and `margin`. If `value` is too long for a QR code, the component throws `QrTooLongError` during render, so put an error boundary around it if the length is not under your control.

### Command line

```sh
npx qr-zero "https://example.com"                     # print to the terminal
npx qr-zero "https://example.com" --ec H --margin 4   # EC level and quiet zone
npx qr-zero "https://example.com" --svg qr.svg        # write an SVG file
echo "piped text" | npx qr-zero --svg - > qr.svg      # stdin in, SVG to stdout
```

| Option             | Description |
| ------------------ | ----------- |
| `-e, --ec <level>` | Error correction: `L`, `M` (default), `Q` or `H`. |
| `-m, --margin <n>` | Quiet zone in modules. Defaults to 2 in the terminal and 4 in SVG. |
| `-o, --svg <file>` | Write an SVG file instead of printing. Use `-` for stdout. |
| `--title <text>`   | Accessible title for the SVG. |
| `--mode <mode>`    | `auto` (default), `numeric`, `alphanumeric` or `byte`. |
| `--eci`            | Start with a UTF-8 ECI designator. |
| `--ascii`          | Draw with `##` instead of Unicode half blocks. |
| `--light-bg`       | Don't invert the output. Use it when the terminal has a light background. |

Without a text argument, the CLI reads the payload from stdin and drops one trailing newline. It exits with 1 when the payload doesn't fit and with 2 on a usage error.

### Terminal

```ts
import { encode, toString } from "qr-zero";
console.log(toString(encode("https://example.com"), { invert: true }));
```

Most terminals show light text on a dark background, so use `invert: true` there to get a code that scans. The `qr-zero` CLI inverts by default.

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

Limits count **UTF-8 bytes**, not characters. `"م"` takes 2 bytes, and most emoji take 4. `MAX_BYTES` is the limit for arbitrary data in byte mode. Digits and uppercase text fit more (up to 7089 digits at level L), and `capacity(version, ecLevel, mode)` gives the exact figure for each mode.

## API

### `encode(input, options?) → QrCode`

Encodes the input as the smallest QR symbol that fits.

- `input`: `string | Uint8Array`. A string is encoded as UTF-8. A `Uint8Array` is taken as raw bytes and decodes back exactly as given. Runs of digit or alphanumeric bytes are segmented the same way as in a string.
- `options`: an `EcLevel` string, or an object with these fields:
  - `ecLevel?: "L" | "M" | "Q" | "H"`: defaults to `"M"`.
  - `mode?: "auto" | "numeric" | "alphanumeric" | "byte"`: `"auto"` (the default) picks the smallest mixed-mode segmentation. A mode name encodes the whole input as one segment in that mode.
  - `eci?: boolean`: starts the symbol with a UTF-8 ECI designator. Defaults to `false`. See [ECI](#eci-utf-8-declaration).
  - `minVersion?: number`: the smallest version to use (1–40, default 1). It sets a floor, not a fixed version, so a longer payload still gets a bigger symbol. Use it to keep the size the same across payloads.
  - `mask?: number`: forces mask pattern 0–7. By default qr-zero tries all eight and keeps the one with the lowest ISO/IEC 18004 penalty score.

It throws `QrTooLongError` when the input is too long for a version-40 symbol, `RangeError` when an option is invalid or the input has characters the forced `mode` can't encode, and `TypeError` when the input is neither a string nor a `Uint8Array`.

```ts
interface QrCode {
  modules: boolean[][]; // modules[y][x], true = dark; no quiet zone
  size: number;         // modules per side: version * 4 + 17
  version: number;      // 1–40
  ecLevel: EcLevel;
  mask: number;         // 0–7
  bytes: number;        // payload length in bytes
  segments: Segment[];  // e.g. [{ mode: "byte", length: 5 }, { mode: "numeric", length: 12 }]
}
```

A segment's `length` counts its characters: digits, alphanumeric characters or bytes.

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

### `toSvgPath(qr, margin = 0) → string`

Returns the SVG path data that `toSvg` draws: one `M x y h n v1 h-n z` rectangle per horizontal run of dark modules, in module units and offset by `margin`. Use it to build your own SVG markup, or pass it to `new Path2D()` for a canvas.

### `toCanvas(canvas, qr, options?) → canvas`

Resizes `canvas` to `(qr.size + 2 * margin) * moduleSize` pixels square, draws the symbol, and returns the canvas. It throws `TypeError` if the canvas has no 2D context.

| Option       | Default     | Description |
| ------------ | ----------- | ----------- |
| `margin`     | `4`         | Quiet zone in modules. |
| `moduleSize` | `4`         | Canvas pixels per module. Must be a whole number, so that edges stay crisp. |
| `dark`       | `"#000000"` | Colour of the dark modules. |
| `light`      | `"#ffffff"` | Background colour. Pass `null` or `"transparent"` to clear the canvas instead. |

### `toString(qr, options?) → string`

Renders the symbol as text.

| Option   | Default    | Description |
| -------- | ---------- | ----------- |
| `margin` | `2`        | Quiet zone in modules. |
| `style`  | `"blocks"` | `"blocks"` packs two rows into each line using ▀ ▄ █. `"ascii"` uses `##` for each dark module, one row per line. |
| `invert` | `false`    | Swaps dark and light. Use it for dark-background terminals. |

### Capacity helpers

- `MAX_BYTES: Record<EcLevel, number>`: the most bytes a version-40 symbol holds in byte mode at each level.
- `capacity(version, ecLevel, mode = "byte")`: the most characters a single segment of `mode` fits in a given version, matching ISO/IEC 18004 Table 7. For example, `capacity(40, "L", "numeric")` is 7089.
- `byteCapacity(version, ecLevel)`: the same as `capacity(version, ecLevel, "byte")`.
- `dataCodewords(version, ecLevel)`: the data codewords left in a version after error correction.

### `QrTooLongError`

A subclass of `RangeError` with three fields: `bytes` (the input length), `ecLevel`, and `maxBytes` (the most bytes that level holds in byte mode). With numeric or alphanumeric content, an input longer than `maxBytes` may still fit, so the error reports what was tried rather than a hard byte limit.

### Types

`EcLevel`, `Mode`, `Segment`, `EncodeOptions`, `QrCode`, `SvgOptions`, `CanvasOptions`, `CanvasLike`, `CanvasContext2D` and `TextOptions` are exported from `qr-zero`, and `QrCodeProps` from `qr-zero/react`.

## Limits and non-goals

- **No Kanji mode.** Japanese text goes into byte mode as UTF-8, which every reader handles but which takes more space than Shift JIS Kanji mode would.
- **ECI is UTF-8 only and off by default.** Without `eci`, strings are written as UTF-8 with no designator (see [ECI](#eci-utf-8-declaration)). If you need another character set, encode it yourself and pass a `Uint8Array`.
- **No Micro QR, rMQR or structured append.**
- **Mask choice may differ from other encoders.** Every mask gives a valid symbol. qr-zero scores penalty rule 3 as the spec describes, and some libraries (including `qrcode`) score it differently, so for the same input they may pick a different mask.
- **Rendering stays minimal.** The package includes SVG, canvas and text renderers and nothing more: no logos, rounded modules or PNG output. The boolean matrix lets you build those yourself.

## Bundle size

Measured with esbuild (minify, ES2020) on the built ESM output, using `npm run size`:

| Import                            | Minified | Min + gzip | Min + brotli |
| --------------------------------- | -------- | ---------- | ------------ |
| Everything                        | 10.76 kB | **4.84 kB** | 4.37 kB     |
| `encode` + `toSvg`                | 9.07 kB  | 4.22 kB    | 3.83 kB      |
| `encode` + `toCanvas`             | 8.77 kB  | 4.03 kB    | 3.64 kB      |
| `encode` only                     | 8.05 kB  | 3.72 kB    | 3.40 kB      |
| `qr-zero/react` (without React)   | 8.88 kB  | 4.16 kB    | 3.75 kB      |

The package sets `"sideEffects": false`, so bundlers drop the renderers you don't import. `qr-zero/react` and the CLI import the core bundle rather than carrying their own copy of it. Mode segmentation and ECI added about 0.8 kB (gzip) to `encode` compared with 0.1.0, which was byte-mode only (2.92 kB).

On an Apple-silicon laptop under Node 24, one `encode` call takes about 0.3 ms for a 40-byte URL, 5 ms for 1 kB, and 12 ms for a full version-40 symbol (2953 bytes or 7089 digits).

## Testing

```sh
npm test            # node:test via tsx
npm run typecheck
npm run check:pack  # build, npm pack, install the tarball, import + require it
```

The suite (103 tests) covers:

- **GF(256) and Reed–Solomon**: checked against the spec's generator polynomials and worked examples.
- **Capacities, format bits and version bits**: byte, numeric and alphanumeric capacities for every version and EC level (checked against Table 7 and the `qrcode` package), each capacity boundary hit with a real payload, character-count widths per version range, the `MAX_BYTES` limit and `QrTooLongError`; all 32 format words and the version words, read back out of encoded matrices.
- **Segmentation**: mode selection, the 45-character alphanumeric set, digit runs inside text, version-range-dependent splits, multi-byte UTF-8, forced modes, the spec's numeric and alphanumeric bit-stream examples, and an exhaustive search confirming the split is optimal on short inputs.
- **End-to-end decoding**: every version 1–40 at every EC level, filled to capacity in byte, numeric and alphanumeric mode, is rasterised and decoded with **jsQR**, which must also report the same segment modes. So are mixed-mode inputs, Arabic/emoji payloads, ECI and all eight masks. One combination, 23-L, is left out. jsQR 1.4.0 lists version 23's alignment centres as `[6, 30, 54, 74, 102]`, while the spec says 78, not 74. That bug makes jsQR fail on 23-L symbols from any encoder.
- **Reference comparison**: about 800 symbols compared module by module with the **`qrcode`** package, given the same segments, version and mask: byte, numeric and alphanumeric at every version and level (23-L included) and 160 mixed-mode inputs. Inputs are also checked against `qrcode`'s own automatic segmentation. That library optimises for an estimated version, so its split sometimes differs. When the splits match, the symbols must match module for module. When they differ, both must decode to the same text and qr-zero's symbol must be no larger.
- **Renderers**: SVG, data URI, `toSvgPath`, text, and `toCanvas` against a recording 2D context; the React component rendered with `react-dom/server` and compared with `toSvg`; a check that the core entry never imports React.
- **CLI**: the `qr-zero` bin run through `child_process`, covering terminal output parsed back into modules, SVG files, stdin, options and exit codes.

`npm run check:pack` also installs the packed tarball and checks the `qr-zero/react` subpath (ESM, CJS and types) and the `qr-zero` bin.

## Credits

- The encoder follows **ISO/IEC 18004:2015**.
- The table layout, the module-count formula and the alignment-position formula follow [Project Nayuki's QR Code generator library](https://www.nayuki.io/page/qr-code-generator-library) (MIT), which is an excellent reference implementation.
- The worked examples in [Thonky's QR Code Tutorial](https://www.thonky.com/qr-code-tutorial/) were used as test vectors.
- [jsQR](https://github.com/cozmo/jsQR) and [node-qrcode](https://github.com/soldair/node-qrcode) are used only as test oracles (dev dependencies), and React only to test `qr-zero/react`.

"QR Code" is a registered trademark of DENSO WAVE INCORPORATED.

## License

[MIT](./LICENSE) © 2026 Fady Ehab Amer
