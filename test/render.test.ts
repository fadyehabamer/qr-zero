import { test } from "node:test";
import assert from "node:assert/strict";
import { encode, toDataURL, toString, toSvg, toSvgPath } from "../src/index";

const qr = encode("https://example.com/?q=<qr>&x=1", "M");

/** Rebuild the module grid from an SVG path of `M x y h n v1 h-n z` runs. */
function modulesFromSvg(svg: string, margin: number): boolean[][] {
  const d = /<path[^>]* d="([^"]*)"/.exec(svg)![1];
  const grid = Array.from({ length: qr.size }, () => new Array<boolean>(qr.size).fill(false));
  for (const m of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-(\d+)z/g)) {
    const [x, y, n, back] = [+m[1], +m[2], +m[3], +m[4]];
    assert.equal(n, back);
    for (let i = 0; i < n; i++) grid[y - margin][x - margin + i] = true;
  }
  return grid;
}

test("toSvg: default output is a well-formed, scalable SVG", () => {
  const svg = toSvg(qr);
  const dim = qr.size + 8;
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.ok(svg.endsWith("</svg>"));
  assert.ok(svg.includes(`viewBox="0 0 ${dim} ${dim}"`));
  assert.ok(svg.includes(`width="${dim * 4}" height="${dim * 4}"`));
  assert.ok(svg.includes(`<rect width="${dim}" height="${dim}" fill="#ffffff"/>`));
  assert.ok(svg.includes(`<path fill="#000000"`));
  assert.ok(!svg.includes("role="));
  assert.ok(!svg.includes("<title>"));
});

test("toSvg: path reproduces the module matrix exactly", () => {
  for (const margin of [0, 4]) {
    assert.deepEqual(modulesFromSvg(toSvg(qr, { margin }), margin), qr.modules);
  }
});

test("toSvgPath: the path toSvg draws, offset by the margin", () => {
  assert.ok(toSvg(qr, { margin: 3 }).includes(` d="${toSvgPath(qr, 3)}"`));
  assert.ok(toSvgPath(qr).startsWith("M0 0h7v1h-7z"), "finder's top edge at the origin");
});

test("toSvg: margin, colours and moduleSize", () => {
  const svg = toSvg(qr, { margin: 1, dark: "#123456", light: "rgb(250,250,250)", moduleSize: 10 });
  const dim = qr.size + 2;
  assert.ok(svg.includes(`viewBox="0 0 ${dim} ${dim}"`));
  assert.ok(svg.includes(`width="${dim * 10}"`));
  assert.ok(svg.includes(`fill="#123456"`));
  assert.ok(svg.includes(`fill="rgb(250,250,250)"`));
});

test("toSvg: light null or transparent omits the background", () => {
  assert.ok(!toSvg(qr, { light: null }).includes("<rect"));
  assert.ok(!toSvg(qr, { light: "transparent" }).includes("<rect"));
});

test("toSvg: title adds role, aria-label and an escaped <title>", () => {
  const svg = toSvg(qr, { title: `Scan "me" <now> & 'go'` });
  const escaped = "Scan &quot;me&quot; &lt;now&gt; &amp; &apos;go&apos;";
  assert.ok(svg.includes(`role="img" aria-label="${escaped}"`));
  assert.ok(svg.includes(`<title>${escaped}</title>`));
  assert.ok(svg.indexOf("<title>") < svg.indexOf("<rect"), "title is the first child");
});

test("toSvg: colours are attribute-escaped", () => {
  assert.ok(toSvg(qr, { dark: `red" onload="x` }).includes(`fill="red&quot; onload=&quot;x"`));
});

test("toSvg: invalid margin or moduleSize throws", () => {
  assert.throws(() => toSvg(qr, { margin: -1 }), RangeError);
  assert.throws(() => toSvg(qr, { margin: 1.5 }), RangeError);
  assert.throws(() => toSvg(qr, { moduleSize: 0 }), RangeError);
  assert.throws(() => toSvg(qr, { moduleSize: Number.NaN }), RangeError);
});

test("toDataURL: percent-encoded SVG that decodes back to toSvg()", () => {
  const opts = { title: "مرحبا 👋 #1", margin: 2 };
  const url = toDataURL(qr, opts);
  const prefix = "data:image/svg+xml;charset=utf-8,";
  assert.ok(url.startsWith(prefix));
  assert.ok(!/[\s"<>#]/.test(url.slice(prefix.length)));
  assert.equal(decodeURIComponent(url.slice(prefix.length)), toSvg(qr, opts));
});

test("toString (blocks): two module rows per line", () => {
  const out = toString(qr);
  const lines = out.split("\n");
  const dim = qr.size + 4;
  assert.equal(lines.length, Math.ceil(dim / 2));
  assert.ok(lines.every((l) => [...l].length === dim));
  assert.ok(/^[ ▀▄█\n]+$/.test(out));
  // The first line is quiet zone only.
  assert.equal(lines[0], " ".repeat(dim));
});

test("toString (ascii): one line per row, two chars per module", () => {
  const out = toString(qr, { style: "ascii", margin: 0 });
  const lines = out.split("\n");
  assert.equal(lines.length, qr.size);
  lines.forEach((line, y) => {
    assert.equal(line.length, qr.size * 2);
    qr.modules[y].forEach((dark, x) => assert.equal(line.slice(x * 2, x * 2 + 2), dark ? "##" : "  "));
  });
});

test("toString: invert swaps dark and light", () => {
  const normal = toString(qr, { style: "ascii", margin: 1 });
  const inverted = toString(qr, { style: "ascii", margin: 1, invert: true });
  const swap = (s: string) => s.replace(/##|  /g, (p) => (p === "##" ? "  " : "##"));
  assert.equal(inverted, swap(normal));
  assert.throws(() => toString(qr, { margin: -2 }), RangeError);
});
