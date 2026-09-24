import type { Mode, Segment } from "qr-zero";

const COUNT_BITS: Record<Mode, readonly [number, number, number]> = {
  numeric: [10, 12, 14],
  alphanumeric: [9, 11, 13],
  byte: [8, 16, 16],
};

const versionRange = (version: number): 0 | 1 | 2 => (version <= 9 ? 0 : version <= 26 ? 1 : 2);

export function payloadBits(mode: Mode, length: number): number {
  if (mode === "numeric") return 10 * Math.floor(length / 3) + [0, 4, 7][length % 3];
  if (mode === "alphanumeric") return 11 * Math.floor(length / 2) + 6 * (length % 2);
  return 8 * length;
}

export function usedBits(segments: readonly Segment[], version: number, eci = false): number {
  let bits = eci ? 12 : 0;
  for (const { mode, length } of segments) {
    bits += 4 + COUNT_BITS[mode][versionRange(version)] + payloadBits(mode, length);
  }
  return bits;
}

export function utf8Length(text: string): number {
  return new TextEncoder().encode(text).length;
}
