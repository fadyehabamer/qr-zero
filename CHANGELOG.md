# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

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

[0.1.0]: https://github.com/fadyehabamer/qr-zero/releases/tag/v0.1.0
