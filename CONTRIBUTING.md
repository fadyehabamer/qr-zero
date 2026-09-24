# Contributing to qr-zero

Thanks for your interest in qr-zero. Bug reports with a failing input, new
tests, docs fixes and features that fit the project's scope are all welcome.

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
Please report security problems privately as described in
[SECURITY.md](SECURITY.md), not in a public issue.

## Scope

qr-zero is a small, zero-dependency QR encoder. Before starting on a feature,
read the [Limits and non-goals](README.md#limits-and-non-goals) section of the
README. In short:

- **No runtime dependencies.** Everything in `dependencies` stays empty. Dev
  dependencies are fine for tests and tooling.
- **Bundle size matters.** The core is about 4.8 kB min + gzip. A change that
  grows `encode` noticeably needs a good reason, and new renderers should be
  tree-shakeable so people who don't import them don't pay for them.
- **Correctness is checked against real decoders.** Output has to decode with
  jsQR and, where the segments match, be identical module for module to the
  `qrcode` package.

If you're unsure whether something fits, open a feature request first and
we'll talk it through before you write code.

## Setup

You need Node.js 20 or 22 (CI tests both; the package itself supports Node 18
and later) and npm.

```sh
git clone https://github.com/<your-username>/qr-zero.git
cd qr-zero
npm ci
```

## Everyday commands

```sh
npm test             # node:test suite, run through tsx (test/*.test.ts)
npm run typecheck    # tsc --noEmit
npm run build        # tsup -> dist/ (ESM, CJS, .d.ts, CLI, react subpath)
npm run size         # build, then print min / gzip / brotli sizes per import
npm run check:pack   # build, npm pack, install the tarball in a temp project,
                     # and check import, require, types, qr-zero/react and the bin
```

CI runs `npm ci`, `typecheck`, `test`, `build`, `scripts/check-pack.sh` and
`scripts/size.mjs` on Node 20 and 22, so running those locally before you push
saves a round trip. There is no separate linter; `tsc` in strict mode and the
`.editorconfig` settings are the style checks.

To run a single test file:

```sh
node --import tsx --test test/segment.test.ts
```

## Trying it out locally

There is no demo site; the README is the documentation. To try the CLI
without building:

```sh
npx tsx src/cli.ts "https://example.com"
npx tsx src/cli.ts "HELLO 123" --ec Q --svg - > /tmp/qr.svg
```

or against the built output:

```sh
npm run build
node dist/cli.js "https://example.com" --svg qr.svg
```

To use your local copy in another project, run `npm run build` and then
`npm install /path/to/qr-zero` (or `npm pack` and install the tarball) in that
project.

If you change something the README documents (an option, a size, a limit, the
test count), update the README in the same PR. The bundle size table in the
README comes from `npm run size`.

## Where things live

| Path | What it does |
| --- | --- |
| `src/encode.ts` | Public `encode()`: options, version selection, bit stream, masking. |
| `src/segment.ts` | Mode classification and the optimal segmentation search. |
| `src/tables.ts` | Capacity, EC block and character-count tables. |
| `src/gf256.ts`, `src/reedSolomon.ts` | Galois field maths and error-correction codewords. |
| `src/matrix.ts` | Function patterns, data placement, masks and penalty scoring. |
| `src/svg.ts`, `src/canvas.ts`, `src/text.ts` | Renderers. |
| `src/react.ts` | The `qr-zero/react` component. |
| `src/cli.ts` | The `qr-zero` command-line tool. |
| `test/` | `node:test` suites. `helpers.ts` has the jsQR round-trip helpers. |
| `scripts/` | `size.mjs` (bundle sizes) and `check-pack.sh` (packed-tarball check). |

## Tests

Every behaviour change needs a test. For encoder changes the most convincing
tests are the ones that already exist in `test/roundtrip.test.ts` and
`test/reference.test.ts`: decode the symbol with jsQR, and compare it with the
`qrcode` package where that makes sense. If you fix a bug, add the input that
triggered it as a test case.

## Branches and commits

Branch from `main` in your fork and name the branch after the change:
`feat/<topic>`, `fix/<topic>`, `docs/<topic>`, `test/<topic>` or
`chore/<topic>`.

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/),
without a scope, like the existing history:

```
feat: toCanvas() renderer for HTML and offscreen canvases
feat: optional ECI designator for UTF-8
test: qrcode comparison and jsQR round trip for numeric, alphanumeric and mixed segments
docs: README for modes, ECI, canvas, React and the CLI
build: report toCanvas and qr-zero/react bundle sizes
```

Keep commits small and focused. Don't commit `dist/`; it's built on publish.

## Pull requests

Open the PR against `main` and fill in the template. A PR is ready when:

- it does one thing,
- `npm run typecheck`, `npm test` and `npm run build` pass,
- new behaviour has tests,
- the README is updated for any public API or CLI change,
- `CHANGELOG.md` has an entry under an `## [Unreleased]` heading for anything
  users will notice (add the heading if it isn't there),
- bundle size changes are mentioned in the description, with the output of
  `npm run size` before and after.

Please don't bump the version in `package.json`; releases are done by the
maintainer.

## Reporting bugs

Use the **Bug report** form. The most useful details are the exact input text
(or bytes), the options you passed (EC level, mode, `minVersion`, `mask`,
`eci`), the qr-zero version and, for scanning problems, which scanner or app
failed to read the code. A small script that reproduces the problem is ideal.

Issues labelled
[`good first issue`](https://github.com/fadyehabamer/qr-zero/labels/good%20first%20issue)
are a good place to start. Leave a comment before you pick one up.

By contributing you agree that your work is licensed under the project's
[MIT License](LICENSE).
