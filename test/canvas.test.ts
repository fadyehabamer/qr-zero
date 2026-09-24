import { test } from "node:test";
import assert from "node:assert/strict";
import { encode, toCanvas, type CanvasContext2D } from "../src/index";

const qr = encode("https://example.com/canvas", "Q");

/** A canvas stand-in that rasterises fillRect/clearRect into a colour grid. */
function fakeCanvas() {
  const calls: string[] = [];
  let pixels: string[][] = [];
  const ctx: CanvasContext2D = {
    fillStyle: "#000000",
    fillRect(x, y, w, h) {
      calls.push(`fill ${ctx.fillStyle} ${x} ${y} ${w} ${h}`);
      for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) pixels[j][i] = String(ctx.fillStyle);
    },
    clearRect(x, y, w, h) {
      calls.push(`clear ${x} ${y} ${w} ${h}`);
      for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) pixels[j][i] = "";
    },
  };
  let width = 300;
  const canvas = {
    get width() {
      return width;
    },
    set width(w: number) {
      width = w;
      pixels = Array.from({ length: w }, () => new Array<string>(w).fill("?"));
    },
    height: 150,
    getContext: (id: "2d") => (id === "2d" ? ctx : null),
  };
  return { canvas, calls, pixel: (x: number, y: number) => pixels[y][x] };
}

test("toCanvas: sizes the canvas and paints every module", () => {
  const { canvas, pixel } = fakeCanvas();
  const out = toCanvas(canvas, qr, { moduleSize: 3, margin: 2 });
  assert.equal(out, canvas);
  const dim = (qr.size + 4) * 3;
  assert.equal(canvas.width, dim);
  assert.equal(canvas.height, dim);
  for (let y = 0; y < dim; y++) {
    for (let x = 0; x < dim; x++) {
      const mx = Math.floor(x / 3) - 2;
      const my = Math.floor(y / 3) - 2;
      const dark = mx >= 0 && my >= 0 && mx < qr.size && my < qr.size && qr.modules[my][mx];
      assert.equal(pixel(x, y), dark ? "#000000" : "#ffffff", `pixel ${x},${y}`);
    }
  }
});

test("toCanvas: colours, transparent background, merged runs", () => {
  const { canvas, calls, pixel } = fakeCanvas();
  toCanvas(canvas, qr, { dark: "rebeccapurple", light: null, moduleSize: 1, margin: 0 });
  assert.equal(calls[0], `clear 0 0 ${qr.size} ${qr.size}`);
  assert.ok(calls.slice(1).every((c) => c.startsWith("fill rebeccapurple ")));
  // One rect per horizontal run, not per module.
  let runs = 0;
  for (const row of qr.modules) row.forEach((d, x) => (runs += d && !row[x - 1] ? 1 : 0));
  assert.equal(calls.length - 1, runs);
  assert.equal(pixel(0, 0), "rebeccapurple");
  assert.equal(pixel(7, 0), "");

  const t = fakeCanvas();
  toCanvas(t.canvas, qr, { light: "transparent" });
  assert.ok(t.calls[0].startsWith("clear "));
});

test("toCanvas: invalid options and a canvas without a 2D context throw", () => {
  const { canvas } = fakeCanvas();
  assert.throws(() => toCanvas(canvas, qr, { margin: -1 }), RangeError);
  assert.throws(() => toCanvas(canvas, qr, { moduleSize: 0 }), RangeError);
  assert.throws(() => toCanvas(canvas, qr, { moduleSize: 2.5 }), RangeError);
  assert.throws(() => toCanvas({ width: 0, height: 0, getContext: () => null }, qr), TypeError);
});

test("toCanvas: importing and calling needs no DOM globals", () => {
  assert.equal(typeof (globalThis as { document?: unknown }).document, "undefined");
  assert.doesNotThrow(() => toCanvas(fakeCanvas().canvas, qr));
});

// Type-level check (never run): real DOM canvases satisfy CanvasLike.
export function acceptsDomCanvases(el: HTMLCanvasElement, off: OffscreenCanvas) {
  const a: HTMLCanvasElement = toCanvas(el, qr);
  const b: OffscreenCanvas = toCanvas(off, qr, { moduleSize: 8 });
  return [a, b];
}
