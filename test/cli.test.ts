import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { encode, toSvg } from "../src/index";

const CLI = fileURLToPath(new URL("../src/cli.ts", import.meta.url));

function run(args: string[], input?: string) {
  const r = spawnSync(process.execPath, ["--import", "tsx", CLI, ...args], {
    input,
    encoding: "utf8",
    // Pipe stdin even without input so the CLI never sees a TTY.
    stdio: ["pipe", "pipe", "pipe"],
  });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** Rebuild the module grid from half-block output (inverted: light is ink). */
function modulesFromBlocks(out: string, size: number, margin: number, invert = true): boolean[][] {
  const lines = out.replace(/\n$/, "").split("\n").map((l) => [...l]);
  const grid: boolean[][] = [];
  for (let y = 0; y < size + margin * 2; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < size + margin * 2; x++) {
      const ch = lines[y >> 1][x];
      const inked = y % 2 === 0 ? ch === "▀" || ch === "█" : ch === "▄" || ch === "█";
      row.push(inked !== invert);
    }
    grid.push(row);
  }
  return grid.slice(margin, margin + size).map((r) => r.slice(margin, margin + size));
}

test("cli: prints an inverted half-block code for the text", () => {
  const r = run(["HELLO 123"]);
  assert.equal(r.code, 0, r.stderr);
  const qr = encode("HELLO 123");
  assert.deepEqual(modulesFromBlocks(r.stdout, qr.size, 2), qr.modules);
});

test("cli: --ec, --margin and --light-bg", () => {
  const qr = encode("https://example.com", "H");
  const r = run(["https://example.com", "--ec", "H", "--margin", "4", "--light-bg"]);
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(modulesFromBlocks(r.stdout, qr.size, 4, false), qr.modules);
  assert.equal(run(["x", "-e", "q"]).code, 0, "EC level is case-insensitive");
});

test("cli: --ascii", () => {
  const r = run(["hi", "--ascii", "--margin", "0", "--light-bg"]);
  const qr = encode("hi");
  const lines = r.stdout.replace(/\n$/, "").split("\n");
  assert.equal(lines.length, qr.size);
  lines.forEach((line, y) => assert.equal(line, qr.modules[y].map((d) => (d ? "##" : "  ")).join("")));
});

test("cli: --svg writes the same SVG as toSvg()", () => {
  const dir = mkdtempSync(join(tmpdir(), "qr-zero-cli-"));
  try {
    const file = join(dir, "out.svg");
    const r = run(["مرحبا 👋", "--svg", file, "--ec", "Q", "--margin", "2", "--title", "Hi"]);
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.stdout, "");
    const qr = encode("مرحبا 👋", "Q");
    assert.equal(readFileSync(file, "utf8"), toSvg(qr, { margin: 2, title: "Hi" }) + "\n");
    assert.match(r.stderr, new RegExp(`wrote .*out\\.svg \\(version ${qr.version}, ${qr.size}×${qr.size} modules, EC Q\\)`));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli: --svg - writes to stdout", () => {
  const r = run(["0123456789", "-o", "-"]);
  assert.equal(r.stdout, toSvg(encode("0123456789")) + "\n");
});

test("cli: reads stdin when no text is given, dropping one trailing newline", () => {
  const qr = encode("from stdin\n2nd line");
  const r = run(["--svg", "-"], "from stdin\n2nd line\n");
  assert.equal(r.stdout, toSvg(qr) + "\n");
});

test("cli: --mode and --eci reach the encoder", () => {
  assert.equal(run(["12345", "--mode", "byte", "-o", "-"]).stdout, toSvg(encode("12345", { mode: "byte" })) + "\n");
  assert.equal(run(["é", "--eci", "-o", "-"]).stdout, toSvg(encode("é", { eci: true })) + "\n");
});

test("cli: --help and --version", () => {
  const help = run(["--help"]);
  assert.equal(help.code, 0);
  assert.match(help.stdout, /^Usage: qr-zero/);
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(run(["-v"]).stdout, pkg.version + "\n");
});

test("cli: usage errors exit 2, encoding errors exit 1", () => {
  const usage = [
    ["x", "--ec", "X"],
    ["x", "--margin=-1"],
    ["x", "--margin", "two"],
    ["x", "--mode", "kanji"],
    ["x", "--bogus"],
    ["x", "--margin"],
  ];
  for (const args of usage) {
    const r = run(args);
    assert.equal(r.code, 2, args.join(" "));
    assert.match(r.stderr, /^qr-zero: [^\n]+\n(.*\n)*Run "qr-zero --help" for usage\.\n$/);
  }
  assert.equal(run([], "").code, 0, "empty stdin is an empty payload");
  const long = run(["z".repeat(3000), "--ec", "L"]);
  assert.equal(long.code, 1);
  assert.match(long.stderr, /does not fit/);
  assert.equal(run(["abc", "--mode", "numeric"]).code, 1);
});
