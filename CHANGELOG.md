# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [0.2.0] - 2026-09-24

### Added

- Numeric and alphanumeric modes. By default `encode` splits the input into
  numeric, alphanumeric and byte segments, using the split with the fewest
  bits for each version range (an exact dynamic-programming search), so
  digits, uppercase text and long digit runs inside text produce smaller
  symbols.
- `mode` option (`"auto"`, `"numeric"`, `"alphanumeric"`, `"byte"`) to
  force a single segment; `QrCode.segments` reports the split that was used.
- `eci` option: start the symbol with a UTF-8 ECI designator (assignment
  26). Off by default, because some scanners mishandle ECI.
- `capacity(version, ecLevel, mode)` for per-mode capacities, and the `Mode`
  and `Segment` types.
- `toCanvas(canvas, qr, options)`: draws onto an `HTMLCanvasElement`,
  `OffscreenCanvas` or any 2D-context canvas, typed structurally so that
  importing the package needs no DOM.
- `toSvgPath(qr, margin)`: the SVG path data that `toSvg` draws, also usable
  with `Path2D`.
- `qr-zero/react`: a `<QrCode value ecLevel size title />` component that
  renders inline SVG. React is an optional peer dependency, and the main
  entry never imports it.
- `qr-zero` command-line tool: prints a code to the terminal, or writes SVG
  with `--svg`; supports `--ec`, `--margin`, `--mode`, `--eci` and stdin.

### Changed

- Inputs that contain digits or uppercase text may now encode to a smaller
  version with different modules than in 0.1.0. Pass `{ mode: "byte" }` to
  get the 0.1.0 output.
- `QrTooLongError`'s message now names byte mode, because numeric and
  alphanumeric input can hold more than `maxBytes`.
- The core grows from 2.92 kB to 3.72 kB min + gzip for `encode` alone.

## [0.1.0] - 2026-09-24

Initial release.

### Added

- `encode(input, options)` — byte-mode QR encoder for versions 1–40 and EC
  levels L/M/Q/H, with automatic version selection, penalty-scored mask
  selection, `minVersion` and forced-`mask` options. Accepts UTF-8 strings or
  raw `Uint8Array` bytes.
- `toSvg(qr, options)` — compact SVG renderer with `margin`, `dark`, `light`
  (or transparent), `moduleSize` and an accessible `title`.
- `toDataURL(qr, options)` — SVG as a percent-encoded data URI.
- `toString(qr, options)` — Unicode half-block or ASCII text renderer.
- `QrTooLongError`, `MAX_BYTES`, `byteCapacity()` and `dataCodewords()`.
- ESM + CJS builds with TypeScript declarations; zero runtime dependencies.

[0.2.0]: https://github.com/fadyehabamer/qr-zero/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/fadyehabamer/qr-zero/releases/tag/v0.1.0
