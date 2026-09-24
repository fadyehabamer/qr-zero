import { test } from "node:test";
import assert from "node:assert/strict";
import { encode } from "../src/index";
import { formatInfo, versionInfo } from "../src/matrix";
import { EC_LEVELS } from "../src/tables";

// ISO/IEC 18004 Table C.1, masked format information by EC level and mask 0–7.
const FORMAT_TABLE: Record<string, number[]> = {
  L: [0x77c4, 0x72f3, 0x7daa, 0x789d, 0x662f, 0x6318, 0x6c41, 0x6976],
  M: [0x5412, 0x5125, 0x5e7c, 0x5b4b, 0x45f9, 0x40ce, 0x4f97, 0x4aa0],
  Q: [0x355f, 0x3068, 0x3f31, 0x3a06, 0x24b4, 0x2183, 0x2eda, 0x2bed],
  H: [0x1689, 0x13be, 0x1ce7, 0x19d0, 0x0762, 0x0255, 0x0d0c, 0x083b],
};

// ISO/IEC 18004 Table D.1 (selected versions).
const VERSION_TABLE: Record<number, number> = {
  7: 0x07c94, 8: 0x085bc, 9: 0x09a99, 10: 0x0a4d3, 20: 0x149a6,
  26: 0x1afab, 32: 0x209d5, 39: 0x27541, 40: 0x28c69,
};

const hamming = (a: number, b: number) => {
  let x = a ^ b;
  let n = 0;
  for (; x; x &= x - 1) n++;
  return n;
};

test("format information matches Table C.1", () => {
  for (const ec of EC_LEVELS) {
    for (let mask = 0; mask < 8; mask++) {
      assert.equal(formatInfo(ec, mask), FORMAT_TABLE[ec][mask], `${ec}/${mask}`);
    }
  }
});

test("format codes have minimum Hamming distance 7", () => {
  const all = EC_LEVELS.flatMap((ec) => [0, 1, 2, 3, 4, 5, 6, 7].map((m) => formatInfo(ec, m)));
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) assert.ok(hamming(all[i], all[j]) >= 7);
  }
});

test("version information matches Table D.1", () => {
  for (const [v, bits] of Object.entries(VERSION_TABLE)) assert.equal(versionInfo(+v), bits, `v${v}`);
  const all = Array.from({ length: 34 }, (_, i) => versionInfo(i + 7));
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) assert.ok(hamming(all[i], all[j]) >= 8);
  }
});

/** Read both format-information copies out of a matrix, MSB first. */
function readFormat(m: boolean[][]): [number, number] {
  const size = m.length;
  const b = (v: boolean) => (v ? 1 : 0);
  let a = 0;
  for (const x of [0, 1, 2, 3, 4, 5, 7, 8]) a = (a << 1) | b(m[8][x]);
  for (const y of [7, 5, 4, 3, 2, 1, 0]) a = (a << 1) | b(m[y][8]);
  let c = 0;
  for (let y = size - 1; y >= size - 7; y--) c = (c << 1) | b(m[y][8]);
  for (let x = size - 8; x < size; x++) c = (c << 1) | b(m[8][x]);
  return [a, c];
}

test("encoded symbols carry correct format info in both copies", () => {
  for (const ec of EC_LEVELS) {
    for (let mask = 0; mask < 8; mask++) {
      for (const text of ["qr-zero", "x".repeat(200)]) {
        const qr = encode(text, { ecLevel: ec, mask });
        const [a, c] = readFormat(qr.modules);
        assert.equal(a, FORMAT_TABLE[ec][mask]);
        assert.equal(c, FORMAT_TABLE[ec][mask]);
        assert.equal(qr.modules[qr.size - 8][8], true, "dark module");
      }
    }
  }
});

test("encoded symbols (v7+) carry version info in both blocks", () => {
  for (const [v, bits] of Object.entries(VERSION_TABLE)) {
    const qr = encode("v", { minVersion: +v, ecLevel: "H" });
    assert.equal(qr.version, +v);
    const s = qr.size;
    let bottomLeft = 0;
    let topRight = 0;
    for (let i = 17; i >= 0; i--) {
      const a = s - 11 + (i % 3);
      const b = Math.floor(i / 3);
      bottomLeft = (bottomLeft << 1) | (qr.modules[a][b] ? 1 : 0);
      topRight = (topRight << 1) | (qr.modules[b][a] ? 1 : 0);
    }
    assert.equal(bottomLeft, bits, `v${v} bottom-left`);
    assert.equal(topRight, bits, `v${v} top-right`);
  }
});

test("timing patterns alternate and finders are intact", () => {
  const qr = encode("https://github.com/fadyehabamer/qr-zero", "Q");
  for (let i = 8; i < qr.size - 8; i++) {
    assert.equal(qr.modules[6][i], i % 2 === 0);
    assert.equal(qr.modules[i][6], i % 2 === 0);
  }
  const finder = ["1111111", "1000001", "1011101", "1011101", "1011101", "1000001", "1111111"];
  for (const [ox, oy] of [[0, 0], [qr.size - 7, 0], [0, qr.size - 7]]) {
    for (let y = 0; y < 7; y++) {
      const row = qr.modules[oy + y].slice(ox, ox + 7).map((v) => (v ? "1" : "0")).join("");
      assert.equal(row, finder[y]);
    }
  }
});
