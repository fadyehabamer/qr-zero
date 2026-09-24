/**
 * Capacity tables and geometry from ISO/IEC 18004.
 */

/** Error-correction level: L ≈ 7 %, M ≈ 15 %, Q ≈ 25 %, H ≈ 30 % recovery. */
export type EcLevel = "L" | "M" | "Q" | "H";

export const EC_LEVELS: readonly EcLevel[] = ["L", "M", "Q", "H"];

export const MIN_VERSION = 1;
export const MAX_VERSION = 40;

/** Error-correction codewords per block, indexed [ecLevel][version]. */
export const ECC_CODEWORDS_PER_BLOCK: Record<EcLevel, readonly number[]> = {
  L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  Q: [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  H: [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
};

/** Number of error-correction blocks, indexed [ecLevel][version]. */
export const NUM_EC_BLOCKS: Record<EcLevel, readonly number[]> = {
  L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  Q: [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  H: [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
};

/** Side length in modules of a symbol of the given version. */
export const symbolSize = (version: number): number => version * 4 + 17;

/** Total data + EC modules in a version, after all function patterns. */
export function rawDataModules(version: number): number {
  let n = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const align = Math.floor(version / 7) + 2;
    n -= (25 * align - 10) * align - 55;
    if (version >= 7) n -= 36;
  }
  return n;
}

/** Total codewords (data + EC) in a version. */
export const totalCodewords = (version: number): number =>
  Math.floor(rawDataModules(version) / 8);

/** Usable data codewords once error correction is subtracted. */
export function dataCodewords(version: number, ec: EcLevel): number {
  return (
    totalCodewords(version) -
    ECC_CODEWORDS_PER_BLOCK[ec][version] * NUM_EC_BLOCKS[ec][version]
  );
}

/** Encoding mode of a data segment. */
export type Mode = "numeric" | "alphanumeric" | "byte";

export const MODES: readonly Mode[] = ["numeric", "alphanumeric", "byte"];

/**
 * Character-count field width, indexed [mode][version range], where the
 * ranges are versions 1–9, 10–26 and 27–40.
 */
const COUNT_BITS = [
  [10, 12, 14],
  [9, 11, 13],
  [8, 16, 16],
];

/** Width of a mode's character-count field at a given version. */
export const countBits = (mode: Mode, version: number): number =>
  COUNT_BITS[MODES.indexOf(mode)][version <= 9 ? 0 : version <= 26 ? 1 : 2];

/**
 * Most characters a single segment of one mode fits in a given version and
 * EC level. Numeric packs 3 digits into 10 bits, alphanumeric 2 characters
 * into 11 bits, byte mode 8 bits per byte.
 */
export function capacity(version: number, ec: EcLevel, mode: Mode = "byte"): number {
  const bits = dataCodewords(version, ec) * 8 - 4 - countBits(mode, version);
  const r = mode === "numeric" ? bits % 10 : bits % 11;
  const n =
    mode === "numeric"
      ? Math.floor(bits / 10) * 3 + (r >= 7 ? 2 : r >= 4 ? 1 : 0)
      : mode === "alphanumeric"
        ? Math.floor(bits / 11) * 2 + (r >= 6 ? 1 : 0)
        : Math.floor(bits / 8);
  return Math.min(n, 2 ** countBits(mode, version) - 1);
}

/** Largest byte-mode payload a given version holds at a given EC level. */
export const byteCapacity = (version: number, ec: EcLevel): number =>
  Math.floor((dataCodewords(version, ec) * 8 - 4 - countBits("byte", version)) / 8);

/** Longest payload (in bytes) a version-40 symbol holds at each EC level. */
export const MAX_BYTES: Readonly<Record<EcLevel, number>> = {
  L: byteCapacity(MAX_VERSION, "L"),
  M: byteCapacity(MAX_VERSION, "M"),
  Q: byteCapacity(MAX_VERSION, "Q"),
  H: byteCapacity(MAX_VERSION, "H"),
};

/** Alignment-pattern centre coordinates (both axes) for a version. */
export function alignmentPositions(version: number): number[] {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  // Version 32 is the one case the spacing formula does not describe.
  const step =
    version === 32
      ? 26
      : Math.floor((version * 4 + count * 2 + 1) / (count * 2 - 2)) * 2;
  const positions: number[] = [];
  for (let i = 0, pos = version * 4 + 10; i < count - 1; i++, pos -= step) {
    positions.unshift(pos);
  }
  positions.unshift(6); // the first centre always sits on the timing pattern
  return positions;
}
