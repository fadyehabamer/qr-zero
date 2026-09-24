import { test } from "node:test";
import assert from "node:assert/strict";
import { EXP, LOG, gfMul } from "../src/gf256";
import { ecCodewords, generatorPoly } from "../src/reedSolomon";

test("EXP and LOG are inverse over the non-zero field elements", () => {
  const seen = new Set<number>();
  for (let i = 0; i < 255; i++) {
    seen.add(EXP[i]);
    assert.equal(LOG[EXP[i]], i);
  }
  assert.equal(seen.size, 255);
  assert.ok(!seen.has(0));
});

test("EXP follows the 0x11d primitive polynomial", () => {
  assert.deepEqual(
    Array.from(EXP.subarray(0, 12)),
    [1, 2, 4, 8, 16, 32, 64, 128, 29, 58, 116, 232],
  );
  assert.equal(EXP[25], 3); // α^25 = 3 in the QR field
});

test("gfMul: known products, zero, identity, commutativity, inverses", () => {
  assert.equal(gfMul(2, 128), 29);
  const slow = (a: number, b: number) => {
    let r = 0;
    while (b) {
      if (b & 1) r ^= a;
      a <<= 1;
      if (a & 0x100) a ^= 0x11d;
      b >>= 1;
    }
    return r;
  };
  for (let a = 0; a < 256; a += 7) {
    for (let b = 0; b < 256; b += 5) {
      assert.equal(gfMul(a, b), slow(a, b), `${a}·${b}`);
      assert.equal(gfMul(a, b), gfMul(b, a));
    }
    assert.equal(gfMul(a, 0), 0);
    assert.equal(gfMul(a, 1), a);
    if (a) assert.equal(gfMul(a, EXP[(255 - LOG[a]) % 255]), 1);
  }
});

const asExponents = (poly: Uint8Array) => Array.from(poly, (c) => LOG[c]);

test("generator polynomials match ISO/IEC 18004 Annex A", () => {
  assert.deepEqual(asExponents(generatorPoly(7)), [0, 87, 229, 146, 149, 238, 102, 21]);
  assert.deepEqual(
    asExponents(generatorPoly(10)),
    [0, 251, 67, 46, 61, 118, 70, 64, 94, 32, 45],
  );
  assert.deepEqual(
    asExponents(generatorPoly(13)),
    [0, 74, 152, 176, 100, 86, 100, 106, 104, 130, 218, 206, 140, 78],
  );
  assert.equal(generatorPoly(30).length, 31);
  assert.equal(generatorPoly(30), generatorPoly(30), "cached");
});

test("Reed–Solomon: 'HELLO WORLD' 1-M worked example", () => {
  const data = new Uint8Array([32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17]);
  assert.deepEqual(
    Array.from(ecCodewords(data, 10)),
    [196, 35, 39, 119, 235, 215, 231, 226, 93, 23],
  );
});

test("Reed–Solomon: ISO/IEC 18004 Annex I '01234567' 1-M example", () => {
  const data = new Uint8Array([16, 32, 12, 86, 97, 128, 236, 17, 236, 17, 236, 17, 236, 17, 236, 17]);
  assert.deepEqual(
    Array.from(ecCodewords(data, 10)),
    [165, 36, 212, 193, 237, 54, 199, 135, 44, 85],
  );
});

test("Reed–Solomon: codeword polynomial is divisible by the generator", () => {
  // Evaluate data‖ec at each root α^i; a valid codeword gives 0 everywhere.
  const data = new Uint8Array(40).map((_, i) => (i * 37 + 11) & 0xff);
  const ec = ecCodewords(data, 18);
  const codeword = [...data, ...ec];
  for (let i = 0; i < 18; i++) {
    let acc = 0;
    for (const c of codeword) acc = gfMul(acc, EXP[i]) ^ c;
    assert.equal(acc, 0, `root α^${i}`);
  }
});
