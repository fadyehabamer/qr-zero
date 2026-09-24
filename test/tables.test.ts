import { test } from "node:test";
import assert from "node:assert/strict";
import {
  alignmentPositions,
  byteCapacity,
  dataCodewords,
  EC_LEVELS,
  MAX_BYTES,
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
