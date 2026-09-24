import { test } from "node:test";
import assert from "node:assert/strict";
import { capacity, encode, QrTooLongError, type Mode, type Segment } from "../src/index";
import jsQR from "jsqr";
import { buildCodewords } from "../src/encode";
import { byteClass, optimalSegments, segmentBits } from "../src/segment";
import { EC_LEVELS, MODES } from "../src/tables";
import { rasterize, rng } from "./helpers";

const utf8 = (s: string) => new TextEncoder().encode(s);
const modesOf = (text: string, version = 1) =>
  optimalSegments(utf8(text), version).map((s) => `${s.mode}:${s.length}`);

test("mode selection: a single segment in the cheapest mode that fits", () => {
  assert.deepEqual(encode("0123456789").segments, [{ mode: "numeric", length: 10 }]);
  assert.deepEqual(encode("HELLO WORLD").segments, [{ mode: "alphanumeric", length: 11 }]);
  assert.deepEqual(encode("HTTPS://EXAMPLE.COM/A-B").segments, [{ mode: "alphanumeric", length: 23 }]);
  assert.deepEqual(encode("hello world").segments, [{ mode: "byte", length: 11 }]);
  assert.deepEqual(encode("").segments, [{ mode: "byte", length: 0 }]);
});

test("the 45 alphanumeric characters, and nothing else, are alphanumeric", () => {
  const set = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
  for (let b = 0; b < 256; b++) {
    const expected = b >= 48 && b <= 57 ? 0 : set.includes(String.fromCharCode(b)) ? 1 : 2;
    assert.equal(byteClass(b), expected, `byte 0x${b.toString(16)}`);
  }
  assert.deepEqual(encode(set.slice(10)).segments, [{ mode: "alphanumeric", length: 35 }]);
  // The leading ten digits are cheaper as their own numeric segment.
  assert.deepEqual(encode(set).segments, [
    { mode: "numeric", length: 10 },
    { mode: "alphanumeric", length: 35 },
  ]);
});

test("mixed segments: long digit runs split out of byte text", () => {
  assert.deepEqual(modesOf("hello 12345678901234567890 world"), ["byte:6", "numeric:20", "byte:6"]);
  // Too short to pay for two extra segment headers.
  assert.deepEqual(modesOf("abc123def"), ["byte:9"]);
  // A digit run inside alphanumeric text.
  assert.deepEqual(modesOf("ABC0123456789012DEF"), ["alphanumeric:19"]);
  assert.deepEqual(modesOf("ABC01234567890123456789DEF"), [
    "alphanumeric:3",
    "numeric:20",
    "alphanumeric:3",
  ]);
  // A lowercase path after an uppercase URL.
  assert.deepEqual(modesOf("HTTPS://EXAMPLE.COM/path?q=1"), ["alphanumeric:20", "byte:8"]);
});

test("mixed segments: the split depends on the version range", () => {
  // Leaving byte mode for 7 digits pays off with 8-bit byte counts (v1–9)
  // but not with 16-bit ones (v10+).
  assert.deepEqual(modesOf("a1234567b", 1), ["byte:1", "numeric:7", "byte:1"]);
  assert.deepEqual(modesOf("a1234567b", 10), ["byte:9"]);
  assert.deepEqual(modesOf("a1234567b", 27), ["byte:9"]);
});

test("mixed segments: multi-byte UTF-8 always stays in byte mode", () => {
  const text = "café ١٢٣٤٥٦ 12345678901234567890 👋";
  const segs = encode(text).segments;
  assert.deepEqual(segs.map((s) => s.mode), ["byte", "numeric", "byte"]);
  assert.equal(segs.reduce((n, s) => n + s.length, 0), utf8(text).length);
});

test("segmentation is well formed: lengths add up and adjacent modes differ", () => {
  const next = rng(7);
  const alphabet = ["0", "1", "9", "A", "Z", " ", ":", "a", "é", "%", "-"];
  for (let t = 0; t < 300; t++) {
    const len = Math.floor(next() * 60);
    let text = "";
    for (let i = 0; i < len; i++) text += alphabet[Math.floor(next() * alphabet.length)];
    const data = utf8(text);
    for (const v of [1, 10, 27]) {
      const segs = optimalSegments(data, v);
      assert.equal(segs.reduce((n, s) => n + s.length, 0), data.length);
      for (let i = 1; i < segs.length; i++) assert.notEqual(segs[i].mode, segs[i - 1].mode);
      let at = 0;
      for (const s of segs) {
        const worst = Math.max(...data.subarray(at, (at += s.length)).map(byteClass));
        assert.ok(MODES.indexOf(s.mode) >= worst, `${text}: ${s.mode} cannot hold its bytes`);
      }
    }
  }
});

/** Exhaustive search over every per-character mode assignment. */
function bruteForceBits(data: Uint8Array, version: number): number {
  let best = Infinity;
  const modes: number[] = [];
  const walk = (i: number) => {
    if (i === data.length) {
      const segs: Segment[] = [];
      modes.forEach((m, j) => {
        if (j > 0 && modes[j - 1] === m) segs[segs.length - 1].length++;
        else segs.push({ mode: MODES[m], length: 1 });
      });
      best = Math.min(best, segmentBits(segs, version));
      return;
    }
    for (let m = byteClass(data[i]); m < 3; m++) {
      modes[i] = m;
      walk(i + 1);
    }
  };
  walk(0);
  return best;
}

test("segmentation is optimal: matches an exhaustive search on short inputs", () => {
  const next = rng(99);
  const alphabet = "0123456789AB:x";
  for (let t = 0; t < 120; t++) {
    const len = 1 + Math.floor(next() * 9);
    let text = "";
    for (let i = 0; i < len; i++) text += alphabet[Math.floor(next() * alphabet.length)];
    for (const v of [1, 10, 27]) {
      const data = utf8(text);
      assert.equal(segmentBits(optimalSegments(data, v), v), bruteForceBits(data, v), `"${text}" v${v}`);
    }
  }
});

test("segmentation never costs more than any single mode", () => {
  const next = rng(3);
  for (let t = 0; t < 200; t++) {
    const len = 1 + Math.floor(next() * 200);
    let text = "";
    for (let i = 0; i < len; i++) text += "0123456789ABCDEFxyz /"[Math.floor(next() * 21)];
    const data = utf8(text);
    for (const v of [1, 10, 27]) {
      const best = segmentBits(optimalSegments(data, v), v);
      for (const mode of MODES) {
        if (data.every((b) => byteClass(b) <= MODES.indexOf(mode))) {
          assert.ok(best <= segmentBits([{ mode, length: data.length }], v));
        }
      }
    }
  }
});

test("numeric and alphanumeric payloads get smaller symbols than byte mode", () => {
  const digits = "12345678901234567890123456789012";
  assert.equal(encode(digits).version, 1);
  assert.equal(encode(digits, { mode: "byte" }).version, 3);
  const url = "HTTPS://GITHUB.COM/FADYEHABAMER/QR-ZERO";
  assert.equal(encode(url, "Q").version, 3);
  assert.equal(encode(url, { ecLevel: "Q", mode: "byte" }).version, 4);
});

test("capacity boundaries: numeric and alphanumeric, every version and EC level", () => {
  const fill: Record<string, string> = { numeric: "7", alphanumeric: "Q" };
  for (const mode of ["numeric", "alphanumeric"] as const) {
    for (const ec of EC_LEVELS) {
      for (let v = 1; v <= 40; v++) {
        const cap = capacity(v, ec, mode);
        const at = encode(fill[mode].repeat(cap), { ecLevel: ec, mask: 0 });
        assert.equal(at.version, v, `${mode} ${ec} v${v} at capacity`);
        assert.deepEqual(at.segments, [{ mode, length: cap }]);
        if (v < 40) {
          assert.equal(encode(fill[mode].repeat(cap + 1), { ecLevel: ec, mask: 0 }).version, v + 1);
        } else {
          assert.throws(() => encode(fill[mode].repeat(cap + 1), { ecLevel: ec, mask: 0 }), QrTooLongError);
        }
      }
    }
  }
});

test("mode option: forcing a mode", () => {
  assert.deepEqual(encode("12345", { mode: "byte" }).segments, [{ mode: "byte", length: 5 }]);
  assert.deepEqual(encode("12345", { mode: "alphanumeric" }).segments, [{ mode: "alphanumeric", length: 5 }]);
  assert.deepEqual(encode("ABC", { mode: "alphanumeric" }).segments, [{ mode: "alphanumeric", length: 3 }]);
  assert.throws(() => encode("12a", { mode: "numeric" }), RangeError);
  assert.throws(() => encode("abc", { mode: "alphanumeric" }), RangeError);
  assert.throws(() => encode("1", { mode: "kanji" as Mode }), RangeError);
});

test("Uint8Array payloads are segmented like the equivalent string", () => {
  const text = "ORDER 000123456789 · ok";
  assert.deepEqual(encode(utf8(text), { mask: 2 }), encode(text, { mask: 2 }));
});

test("numeric bit stream: ISO/IEC 18004 Annex I '01234567' 1-M data codewords", () => {
  const data = buildCodewords(utf8("01234567"), [{ mode: "numeric", length: 8 }], 1, "M");
  assert.deepEqual(
    Array.from(data.subarray(0, 16)),
    [16, 32, 12, 86, 97, 128, 236, 17, 236, 17, 236, 17, 236, 17, 236, 17],
  );
});

test("alphanumeric bit stream: 'HELLO WORLD' 1-Q data codewords", () => {
  const data = buildCodewords(utf8("HELLO WORLD"), [{ mode: "alphanumeric", length: 11 }], 1, "Q");
  assert.deepEqual(
    Array.from(data.subarray(0, 13)),
    [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236],
  );
});

test("segments with short final groups hand over at the right byte", () => {
  // Digit and alphanumeric runs whose lengths leave a 1- or 2-character
  // final group, each followed by another segment.
  const cases = [
    "x12345678901234567é",
    "x1234567890123456é",
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCé",
    "ABCDEFGHIJKLMNOPQRSTUVWXYé",
  ];
  for (const text of cases) {
    const qr = encode(text, "L");
    assert.ok(qr.segments.length > 1, text);
    const { data, width, height } = rasterize(qr);
    assert.equal(jsQR(data, width, height)?.data, text);
  }
});
