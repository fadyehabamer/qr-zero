# Security Policy

## Supported versions

qr-zero is pre-1.0. Only the latest minor release line gets fixes.

| Version | Supported | Notes |
| ------- | --------- | ----- |
| 0.2.x   | Yes       | Current release line (`main`). |
| < 0.2   | No        | Please upgrade to 0.2.x. |

The package has not been published to npm yet. Until it is, "0.2.x" means the
current `main` branch.

## Reporting a vulnerability

Please do not report security problems in public issues or pull requests.

Report privately in one of these ways:

1. **GitHub private vulnerability reporting (preferred).** Go to the
   [Security tab](https://github.com/fadyehabamer/qr-zero/security) and choose
   **Report a vulnerability**. This opens a private advisory that only you and
   the maintainer can see.
2. **Email.** If that button isn't available, write to
   [fadyamer45@gmail.com](mailto:fadyamer45@gmail.com) with "qr-zero security"
   in the subject.

Please include:

- the qr-zero version (or commit),
- the input and options that trigger the problem, ideally as a short script,
- what happens and what the impact is,
- your runtime (Node, Deno, Bun, browser) and its version.

## What to expect

- An acknowledgement within 3 working days.
- An assessment within 7 working days, with a plan and a rough timeline if the
  report is confirmed.
- A fix released as a patch version, noted in `CHANGELOG.md`, and credit in the
  advisory unless you would rather stay anonymous.

Please give us a reasonable amount of time to release a fix before you
disclose the issue publicly.

## Scope

Examples of what we'd treat as security issues:

- Markup injection through renderer options, for example a `title`, `dark` or
  `light` value that escapes the SVG produced by `toSvg`, `toDataURL` or the
  React component.
- A symbol that decodes to different content than the input it was built
  from.
- Inputs that make `encode` hang or use far more CPU or memory than their size
  suggests.
- CLI behaviour that writes somewhere other than the path it was given.
- Problems with the published npm package itself (unexpected files or install
  scripts).

Not in scope: what a scanner does with the decoded content (a QR code that
links to a malicious URL is still a valid QR code), and bugs in the test-only
dev dependencies.
