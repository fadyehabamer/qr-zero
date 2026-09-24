import { alignmentPositions, symbolSize, type EcLevel } from "./tables";

/* --------------------------------------------------------------- BCH coding */

const FORMAT_EC_BITS: Record<EcLevel, number> = { L: 1, M: 0, Q: 3, H: 2 };

/**
 * The 15-bit format information word: 2 EC bits + 3 mask bits, a (15,5) BCH
 * code with generator 0x537, XOR-masked with 0x5412.
 */
export function formatInfo(ec: EcLevel, mask: number): number {
  const data = (FORMAT_EC_BITS[ec] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | (rem & 0x3ff)) ^ 0x5412;
}

/** The 18-bit version information word, a (18,6) BCH code with generator 0x1f25. */
export function versionInfo(version: number): number {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (version << 12) | (rem & 0xfff);
}

/* ------------------------------------------------------------ mask patterns */

/** The eight data-mask conditions; x is the column, y the row. */
export const MASKS: readonly ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/* --------------------------------------------------------------- the matrix */

export type Grid = {
  size: number;
  /** modules[y][x] — true is a dark module. */
  modules: boolean[][];
  /** reserved[y][x] — true for function-pattern modules that data skips. */
  reserved: boolean[][];
};

function blankGrid(size: number): Grid {
  const make = () =>
    Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  return { size, modules: make(), reserved: make() };
}

function set(g: Grid, x: number, y: number, dark: boolean) {
  g.modules[y][x] = dark;
  g.reserved[y][x] = true;
}

function drawFinder(g: Grid, cx: number, cy: number) {
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= g.size || y >= g.size) continue;
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      set(g, x, y, d !== 2 && d !== 4); // 4 is the separator ring
    }
  }
}

/**
 * A grid with every function pattern drawn: finders, separators, timing,
 * alignment, the dark module and version information. Format-information
 * areas are reserved but left blank until a mask is chosen.
 */
export function functionGrid(version: number): Grid {
  const size = symbolSize(version);
  const g = blankGrid(size);

  for (let i = 0; i < size; i++) {
    set(g, i, 6, i % 2 === 0);
    set(g, 6, i, i % 2 === 0);
  }

  drawFinder(g, 3, 3);
  drawFinder(g, size - 4, 3);
  drawFinder(g, 3, size - 4);

  const pos = alignmentPositions(version);
  const last = pos.length - 1;
  for (let i = 0; i <= last; i++) {
    for (let j = 0; j <= last; j++) {
      // Skip the three centres that would collide with finder patterns.
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          set(g, pos[j] + dx, pos[i] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }
  }

  // Reserve the format-information strips (written after masking): 9 + 9
  // around the top-left finder, 8 along the top-right, 7 down the
  // bottom-left (the eighth is the always-dark module).
  for (let i = 0; i < 9; i++) {
    g.reserved[8][i] = true;
    g.reserved[i][8] = true;
  }
  for (let i = 0; i < 8; i++) g.reserved[8][size - 1 - i] = true;
  for (let i = 0; i < 7; i++) g.reserved[size - 1 - i][8] = true;
  set(g, 8, size - 8, true); // the always-dark module

  if (version >= 7) {
    const bits = versionInfo(version);
    for (let i = 0; i < 18; i++) {
      const bit = ((bits >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      set(g, a, b, bit); // top-right block
      set(g, b, a, bit); // bottom-left block
    }
  }

  return g;
}

/** Write both copies of the format information for an EC level and mask. */
export function drawFormat(g: Grid, ec: EcLevel, mask: number): void {
  const bits = formatInfo(ec, mask);
  const size = g.size;
  for (let i = 0; i < 15; i++) {
    const bit = ((bits >>> i) & 1) === 1;
    // Copy 1 — around the top-left finder.
    if (i < 6) g.modules[i][8] = bit;
    else if (i < 8) g.modules[i + 1][8] = bit;
    else if (i === 8) g.modules[8][7] = bit;
    else g.modules[8][14 - i] = bit;
    // Copy 2 — split between the other two finders.
    if (i < 8) g.modules[8][size - 1 - i] = bit;
    else g.modules[size - 15 + i][8] = bit;
  }
}

/** Zig-zag placement of the final codeword sequence, two columns at a time. */
export function placeCodewords(g: Grid, data: Uint8Array): void {
  const size = g.size;
  let bit = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // the vertical timing column is skipped
    const upward = ((right + 1) & 2) === 0;
    for (let vert = 0; vert < size; vert++) {
      const y = upward ? size - 1 - vert : vert;
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        if (g.reserved[y][x]) continue;
        g.modules[y][x] =
          bit < data.length * 8 && ((data[bit >>> 3] >>> (7 - (bit & 7))) & 1) === 1;
        bit++;
      }
    }
  }
}

/** XOR a mask over every non-function module. Applying it twice undoes it. */
export function applyMask(g: Grid, mask: number): void {
  const fn = MASKS[mask];
  for (let y = 0; y < g.size; y++) {
    for (let x = 0; x < g.size; x++) {
      if (!g.reserved[y][x] && fn(x, y)) g.modules[y][x] = !g.modules[y][x];
    }
  }
}

/** ISO/IEC 18004 §7.8.3 penalty score — lower scans more reliably. */
export function penalty(modules: boolean[][], size: number): number {
  let score = 0;
  const runScore = (run: number) => (run >= 5 ? run - 2 : 0);

  for (let axis = 0; axis < 2; axis++) {
    for (let a = 0; a < size; a++) {
      let run = 1;
      let prev = axis === 0 ? modules[a][0] : modules[0][a];
      const runs: number[] = [];
      for (let b = 1; b < size; b++) {
        const cell = axis === 0 ? modules[a][b] : modules[b][a];
        if (cell === prev) {
          run++;
        } else {
          score += runScore(run); // rule 1: runs of five or more
          runs.push(run);
          run = 1;
          prev = cell;
        }
      }
      score += runScore(run);
      runs.push(run);

      // Rule 3: the 1:1:3:1:1 finder look-alike with 4 modules of light space.
      for (let i = 0; i + 4 < runs.length; i++) {
        const [r1, r2, r3, r4, r5] = runs.slice(i, i + 5);
        if (r1 === r2 && r1 === r4 && r1 === r5 && r3 === r1 * 3) {
          const before = i > 0 ? runs[i - 1] : 0;
          const after = i + 5 < runs.length ? runs[i + 5] : 0;
          if (before >= r1 * 4 || after >= r1 * 4) score += 40;
        }
      }
    }
  }

  // Rule 2: 2×2 blocks of one colour.
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = modules[y][x];
      if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) {
        score += 3;
      }
    }
  }

  // Rule 4: deviation from a 50/50 dark ratio.
  let dark = 0;
  for (const row of modules) for (const cell of row) if (cell) dark++;
  const percent = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;

  return score;
}
