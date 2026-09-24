import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  alignmentPositions,
  byteCapacity,
  capacity,
  countBits,
  dataCodewords,
  EC_LEVELS,
  MAX_BYTES,
  MODES,
  rawDataModules,
  symbolSize,
  totalCodewords,
} from "../src/tables";

test("symbol sizes", () => {
  assert.equal(symbolSize(1), 21);
  assert.equal(symbolSize(7), 45);
  assert.equal(symbolSize(40), 177);
});

test("total codewords per version (ISO/IEC 18004 Table 1)", () => {
  const expected: Record<number, number> = { 1: 26, 2: 44, 5: 134, 7: 196, 10: 346, 14: 581, 20: 1085, 27: 1828, 32: 2465, 40: 3706 };
  for (const [v, n] of Object.entries(expected)) assert.equal(totalCodewords(+v), n, `v${v}`);
  // Remainder bits: 0, 7, 3, 4 or 0 depending on the version range.
  assert.equal(rawDataModules(1) % 8, 0);
  assert.equal(rawDataModules(2) % 8, 7);
  assert.equal(rawDataModules(14) % 8, 3);
  assert.equal(rawDataModules(21) % 8, 4);
  assert.equal(rawDataModules(40) % 8, 0);
});

test("data codewords (ISO/IEC 18004 Table 7)", () => {
  const expected: Record<number, [number, number, number, number]> = {
    1: [19, 16, 13, 9],
    2: [34, 28, 22, 16],
    7: [156, 124, 88, 66],
    10: [274, 216, 154, 122],
    20: [861, 669, 485, 385],
    40: [2956, 2334, 1666, 1276],
  };
  for (const [v, row] of Object.entries(expected)) {
    EC_LEVELS.forEach((ec, i) => assert.equal(dataCodewords(+v, ec), row[i], `v${v}-${ec}`));
  }
});

test("byte-mode capacity (ISO/IEC 18004 Table 7)", () => {
  const expected: Record<number, [number, number, number, number]> = {
    1: [17, 14, 11, 7],
    9: [230, 180, 130, 98],
    10: [271, 213, 151, 119],
    26: [1367, 1059, 751, 593],
    27: [1465, 1125, 805, 625],
    40: [2953, 2331, 1663, 1273],
  };
  for (const [v, row] of Object.entries(expected)) {
    EC_LEVELS.forEach((ec, i) => assert.equal(byteCapacity(+v, ec), row[i], `v${v}-${ec}`));
  }
});

test("numeric and alphanumeric capacity (ISO/IEC 18004 Table 7)", () => {
  const expected: Record<number, { numeric: number[]; alphanumeric: number[] }> = {
    1: { numeric: [41, 34, 27, 17], alphanumeric: [25, 20, 16, 10] },
    9: { numeric: [552, 432, 312, 235], alphanumeric: [335, 262, 189, 143] },
    10: { numeric: [652, 513, 364, 288], alphanumeric: [395, 311, 221, 174] },
    40: { numeric: [7089, 5596, 3993, 3057], alphanumeric: [4296, 3391, 2420, 1852] },
  };
  for (const [v, rows] of Object.entries(expected)) {
    for (const mode of ["numeric", "alphanumeric"] as const) {
      EC_LEVELS.forEach((ec, i) =>
        assert.equal(capacity(+v, ec, mode), rows[mode][i], `v${v}-${ec} ${mode}`),
      );
    }
  }
});

test("capacity agrees with the qrcode package for every version, level and mode", () => {
  const require = createRequire(import.meta.url);
  const { getCapacity } = require("qrcode/lib/core/version");
  const refMode = require("qrcode/lib/core/mode");
  const refLevel = require("qrcode/lib/core/error-correction-level");
  const toRef = { numeric: refMode.NUMERIC, alphanumeric: refMode.ALPHANUMERIC, byte: refMode.BYTE };
  for (const ec of EC_LEVELS) {
    for (let v = 1; v <= 40; v++) {
      for (const mode of MODES) {
        assert.equal(capacity(v, ec, mode), getCapacity(v, refLevel[ec], toRef[mode]), `${ec} v${v} ${mode}`);
      }
    }
  }
});

test("character-count field widths per version range", () => {
  const widths = (v: number) => MODES.map((m) => countBits(m, v));
  for (const v of [1, 9]) assert.deepEqual(widths(v), [10, 9, 8]);
  for (const v of [10, 26]) assert.deepEqual(widths(v), [12, 11, 16]);
  for (const v of [27, 40]) assert.deepEqual(widths(v), [14, 13, 16]);
});

test("capacity defaults to byte mode", () => {
  for (const ec of EC_LEVELS) assert.equal(capacity(17, ec), byteCapacity(17, ec));
});

test("MAX_BYTES is the version-40 byte capacity", () => {
  assert.deepEqual({ ...MAX_BYTES }, { L: 2953, M: 2331, Q: 1663, H: 1273 });
});

test("capacity grows strictly with version and shrinks with EC level", () => {
  for (const ec of EC_LEVELS) {
    for (let v = 2; v <= 40; v++) assert.ok(byteCapacity(v, ec) > byteCapacity(v - 1, ec));
  }
  for (let v = 1; v <= 40; v++) {
    for (let i = 1; i < 4; i++) {
      assert.ok(byteCapacity(v, EC_LEVELS[i]) < byteCapacity(v, EC_LEVELS[i - 1]));
    }
  }
});

test("alignment pattern positions (ISO/IEC 18004 Annex E)", () => {
  assert.deepEqual(alignmentPositions(1), []);
  assert.deepEqual(alignmentPositions(2), [6, 18]);
  assert.deepEqual(alignmentPositions(7), [6, 22, 38]);
  assert.deepEqual(alignmentPositions(15), [6, 26, 48, 70]);
  assert.deepEqual(alignmentPositions(22), [6, 26, 50, 74, 98]);
  assert.deepEqual(alignmentPositions(32), [6, 34, 60, 86, 112, 138]);
  assert.deepEqual(alignmentPositions(36), [6, 24, 50, 76, 102, 128, 154]);
  assert.deepEqual(alignmentPositions(40), [6, 30, 58, 86, 114, 142, 170]);
});
