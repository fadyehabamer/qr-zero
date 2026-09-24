import type { QrCode } from "../src/index";

/** Rasterise a symbol to RGBA pixels (black on white, with a quiet zone). */
export function rasterize(qr: QrCode, scale = 4, margin = 4) {
  const dim = (qr.size + margin * 2) * scale;
  const data = new Uint8ClampedArray(dim * dim * 4).fill(255);
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (!qr.modules[y][x]) continue;
      for (let dy = 0; dy < scale; dy++) {
        const row = ((y + margin) * scale + dy) * dim;
        for (let dx = 0; dx < scale; dx++) {
          const i = (row + (x + margin) * scale + dx) * 4;
          data[i] = data[i + 1] = data[i + 2] = 0;
        }
      }
    }
  }
  return { data, width: dim, height: dim };
}

/** Small deterministic PRNG (mulberry32) so failures are reproducible. */
export function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const utf8Length = (s: string) => new TextEncoder().encode(s).length;

/**
 * A random string drawn from `alphabet` whose UTF-8 encoding is exactly
 * `bytes` long (single-byte characters top it up at the end).
 */
export function randomText(bytes: number, alphabet: string[], seed: number): string {
  const next = rng(seed);
  let out = "";
  let used = 0;
  for (;;) {
    const ch = alphabet[Math.floor(next() * alphabet.length)];
    const n = utf8Length(ch);
    if (used + n > bytes) break;
    out += ch;
    used += n;
  }
  while (used < bytes) {
    out += String.fromCharCode(97 + Math.floor(next() * 26));
    used++;
  }
  return out;
}

export const ASCII = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i));
export const ARABIC_EMOJI = [..."مرحبا بالعالم", "😀", "👋🏽", "🇪🇬", "✓", "é", " ", "q", "r"];

export const DIGITS = [..."0123456789"];
export const ALPHANUMERIC = [..."0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:"];

/** Exactly `length` characters drawn from `alphabet`. */
export function randomChars(length: number, alphabet: string[], seed: number): string {
  const next = rng(seed);
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[Math.floor(next() * alphabet.length)];
  return out;
}

/**
 * Text built from runs of digits, uppercase/alphanumeric characters and
 * lowercase or non-ASCII text, so that the optimal split has several modes.
 */
export function mixedText(runs: number, seed: number): string {
  const next = rng(seed);
  const pools = [DIGITS, ALPHANUMERIC, [..."abcxyz?&=_", "é", "م", "👋"]];
  let out = "";
  for (let r = 0; r < runs; r++) {
    const pool = pools[Math.floor(next() * pools.length)];
    out += randomChars(1 + Math.floor(next() * 30), pool, Math.floor(next() * 1e9));
  }
  return out;
}
