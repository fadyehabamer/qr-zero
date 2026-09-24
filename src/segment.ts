import { countBits, MODES, type Mode } from "./tables";

/** A run of the payload encoded in one mode. */
export interface Segment {
  mode: Mode;
  /** Characters in the segment: digits, alphanumeric characters or bytes. */
  length: number;
}

/** The 45-character alphanumeric set, in code-value order. */
export const ALPHANUMERIC = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";

/**
 * The cheapest mode that can hold a byte: 0 numeric, 1 alphanumeric, 2 byte.
 * Every mode can hold everything a cheaper mode can. UTF-8 continuation and
 * lead bytes are all ≥ 0x80, so a multi-byte character is never split.
 */
export const byteClass = (b: number): number =>
  b >= 48 && b <= 57 ? 0 : ALPHANUMERIC.indexOf(String.fromCharCode(b)) >= 0 ? 1 : 2;

/** Payload bits (after the header) for `n` characters in mode index `m`. */
const payloadBits = (m: number, n: number): number =>
  m === 0 ? Math.floor(n / 3) * 10 + [0, 4, 7][n % 3] : m === 1 ? Math.floor(n / 2) * 11 + (n % 2) * 6 : n * 8;

/**
 * Total bits of the segments at a version, headers included. `Infinity` if a
 * segment is too long for its character-count field.
 */
export function segmentBits(segments: readonly Segment[], version: number): number {
  let bits = 0;
  for (const { mode, length } of segments) {
    const cc = countBits(mode, version);
    if (length >= 2 ** cc) return Infinity;
    bits += 4 + cc + payloadBits(MODES.indexOf(mode), length);
  }
  return bits;
}

/**
 * The segmentation of `data` with the fewest bits at a version, found by
 * dynamic programming over (position, mode). Costs are kept in sixths of a
 * bit — a digit is 10/3 bits, an alphanumeric character 11/2 — and rounded
 * up to whole bits wherever a segment closes, which is exactly what the
 * packing into 10- and 11-bit groups costs. Keeping only the cheapest cost
 * per mode is therefore optimal, not just a heuristic.
 */
export function optimalSegments(data: Uint8Array, version: number): Segment[] {
  const n = data.length;
  if (n === 0) return [{ mode: "byte", length: 0 }];
  const head = MODES.map((m) => (4 + countBits(m, version)) * 6);
  const step = [20, 33, 48];
  const ceil = (c: number) => Math.ceil(c / 6) * 6;

  // from[i * 3 + m]: the mode of byte i - 1 on the cheapest path that
  // encodes byte i in mode m.
  const from = new Uint8Array(n * 3);
  let cost = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const cls = byteClass(data[i]);
    const next = [Infinity, Infinity, Infinity];
    for (let m = cls; m < 3; m++) {
      let best = i === 0 ? head[m] : cost[m];
      let prev = m;
      for (let k = 0; i > 0 && k < 3; k++) {
        const c = ceil(cost[k]) + head[m];
        if (c < best) {
          best = c;
          prev = k;
        }
      }
      next[m] = best + step[m];
      from[i * 3 + m] = prev;
    }
    cost = next;
  }

  let m = 0;
  for (let k = 1; k < 3; k++) if (ceil(cost[k]) < ceil(cost[m])) m = k;
  const segments: Segment[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const last = segments[0];
    if (last && last.mode === MODES[m]) last.length++;
    else segments.unshift({ mode: MODES[m], length: 1 });
    m = from[i * 3 + m];
  }
  return segments;
}
