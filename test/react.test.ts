import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { encode, QrTooLongError, toSvg } from "../src/index";
import { QrCode, type QrCodeProps } from "../src/react";

const render = (props: QrCodeProps) => renderToStaticMarkup(createElement(QrCode, props));

test("<QrCode>: renders the same SVG as toSvg()", () => {
  const value = "https://github.com/fadyehabamer/qr-zero";
  const qr = encode(value, "Q");
  const dim = qr.size + 8;
  const html = render({ value, ecLevel: "Q", size: dim * 4, title: `Scan "me" & <go>` });
  // React closes empty elements with an end tag instead of "/>".
  assert.equal(html.replace(/><\/(rect|path)>/g, "/>"), toSvg(qr, { title: `Scan "me" & <go>` }));
});

test("<QrCode>: defaults, size, colours and margin", () => {
  const qr = encode("hello");
  const html = render({ value: "hello" });
  assert.ok(html.includes(`viewBox="0 0 ${qr.size + 8} ${qr.size + 8}"`));
  assert.ok(html.includes(`width="128" height="128"`));
  assert.ok(!html.includes("role=") && !html.includes("<title>"));

  const styled = render({ value: "hello", size: "10rem", margin: 1, dark: "currentColor", light: null });
  assert.ok(styled.includes(`width="10rem"`));
  assert.ok(styled.includes(`viewBox="0 0 ${qr.size + 2} ${qr.size + 2}"`));
  assert.ok(styled.includes(`fill="currentColor"`));
  assert.ok(!styled.includes("<rect"));
  assert.ok(!render({ value: "x", light: "transparent" }).includes("<rect"));
  assert.ok(render({ value: "HELLO", ecLevel: "H" }).includes(toSvg(encode("HELLO", "H")).match(/ d="[^"]+"/)![0]));
});

test("<QrCode>: passes other SVG props through", () => {
  const html = render({ value: "x", className: "qr", style: { display: "block" }, "aria-hidden": true, id: "q" });
  assert.match(html, /class="qr"/);
  assert.match(html, /style="display:block"/);
  assert.match(html, /aria-hidden="true"/);
  assert.match(html, /id="q"/);
});

test("<QrCode>: throws QrTooLongError or RangeError during render", () => {
  assert.throws(() => render({ value: "z".repeat(3000), ecLevel: "L" }), QrTooLongError);
  assert.throws(() => render({ value: "x", margin: -1 }), RangeError);
});

test("the core entry never imports React", () => {
  // Walk the relative imports reachable from src/index.ts.
  const seen = new Set<string>();
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    const src = readFileSync(new URL(`../src/${file}.ts`, import.meta.url), "utf8");
    for (const [, spec] of src.matchAll(/from "([^"]+)"/g)) {
      assert.ok(spec.startsWith("./"), `${file}.ts imports "${spec}"`);
      visit(spec.slice(2));
    }
  };
  visit("index");
  assert.ok(!seen.has("react"));
  assert.ok(seen.has("encode") && seen.has("canvas"));
});
