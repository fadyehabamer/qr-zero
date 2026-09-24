#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { parseArgs } from "node:util";
import { encode, toString, toSvg, type EcLevel, type Mode } from "./index";

const USAGE = `Usage: qr-zero [options] <text>
       echo <text> | qr-zero [options]

Prints a QR code to the terminal, or writes it as SVG.

Options:
  -e, --ec <level>     error correction: L, M, Q or H (default M)
  -m, --margin <n>     quiet zone in modules (default 2 in the terminal, 4 in SVG)
  -o, --svg <file>     write an SVG file instead of printing; "-" for stdout
      --title <text>   accessible title for the SVG
      --mode <mode>    auto, numeric, alphanumeric or byte (default auto)
      --eci            start with a UTF-8 ECI designator
      --ascii          draw with "##" instead of Unicode half blocks
      --light-bg       the terminal has a light background (do not invert)
  -h, --help           show this help
  -v, --version        show the version`;

class UsageError extends Error {}

function main(argv: string[]): number {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        ec: { type: "string", short: "e" },
        margin: { type: "string", short: "m" },
        svg: { type: "string", short: "o" },
        title: { type: "string" },
        mode: { type: "string" },
        eci: { type: "boolean" },
        ascii: { type: "boolean" },
        "light-bg": { type: "boolean" },
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
      },
    });
  } catch (err) {
    throw new UsageError((err as Error).message);
  }
  const { values, positionals } = parsed;

  if (values.help) {
    process.stdout.write(USAGE + "\n");
    return 0;
  }
  if (values.version) {
    const pkg = createRequire(import.meta.url)("../package.json") as { version: string };
    process.stdout.write(pkg.version + "\n");
    return 0;
  }

  const ecLevel = (values.ec ?? "M").toUpperCase() as EcLevel;
  if (!["L", "M", "Q", "H"].includes(ecLevel)) {
    throw new UsageError(`--ec must be L, M, Q or H, got ${values.ec}`);
  }
  let margin: number | undefined;
  if (values.margin !== undefined) {
    if (!/^\d+$/.test(values.margin)) {
      throw new UsageError(`--margin must be a non-negative integer, got ${values.margin}`);
    }
    margin = Number(values.margin);
  }
  const mode = (values.mode ?? "auto") as Mode | "auto";
  if (!["auto", "numeric", "alphanumeric", "byte"].includes(mode)) {
    throw new UsageError(`--mode must be auto, numeric, alphanumeric or byte, got ${values.mode}`);
  }

  let text: string;
  if (positionals.length > 0) {
    text = positionals.join(" ");
  } else if (!process.stdin.isTTY) {
    // One trailing newline from `echo` or a file is not part of the payload.
    text = readFileSync(0, "utf8").replace(/\r?\n$/, "");
  } else {
    throw new UsageError("no text given");
  }

  const qr = encode(text, { ecLevel, mode, eci: values.eci });
  if (values.svg !== undefined) {
    const svg = toSvg(qr, { margin, title: values.title });
    if (values.svg === "-") {
      process.stdout.write(svg + "\n");
    } else {
      writeFileSync(values.svg, svg + "\n");
      process.stderr.write(
        `qr-zero: wrote ${values.svg} (version ${qr.version}, ${qr.size}×${qr.size} modules, EC ${qr.ecLevel})\n`,
      );
    }
  } else {
    const style = values.ascii ? "ascii" : "blocks";
    process.stdout.write(toString(qr, { margin, style, invert: !values["light-bg"] }) + "\n");
  }
  return 0;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (err) {
  if (err instanceof UsageError) {
    process.stderr.write(`qr-zero: ${err.message}\nRun "qr-zero --help" for usage.\n`);
    process.exitCode = 2;
  } else if (err instanceof RangeError) {
    // QrTooLongError, or a payload the forced --mode cannot hold.
    process.stderr.write(`qr-zero: ${err.message}\n`);
    process.exitCode = 1;
  } else {
    throw err;
  }
}
