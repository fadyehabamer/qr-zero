import { EXP, gfMul } from "./gf256";

const generatorCache = new Map<number, Uint8Array>();

/**
 * Reed–Solomon generator polynomial (x - α^0)(x - α^1)…(x - α^(degree-1)),
 * coefficients from highest to lowest power. The leading coefficient is 1.
 */
export function generatorPoly(degree: number): Uint8Array {
  const cached = generatorCache.get(degree);
  if (cached) return cached;
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], EXP[i]);
    }
    poly = next;
  }
  generatorCache.set(degree, poly);
  return poly;
}

/**
 * Error-correction codewords for one data block: the remainder of
 * data(x) · x^degree divided by the generator polynomial.
 */
export function ecCodewords(data: Uint8Array, degree: number): Uint8Array {
  const gen = generatorPoly(degree);
  const remainder = new Uint8Array(degree);
  for (const byte of data) {
    const factor = byte ^ remainder[0];
    remainder.copyWithin(0, 1);
    remainder[degree - 1] = 0;
    for (let i = 0; i < degree; i++) remainder[i] ^= gfMul(gen[i + 1], factor);
  }
  return remainder;
}
