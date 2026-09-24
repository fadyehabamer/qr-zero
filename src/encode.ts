import { ecCodewords } from "./reedSolomon";
import {
  applyMask,
  drawFormat,
  functionGrid,
  penalty,
  placeCodewords,
  type Grid,
} from "./matrix";
import { ALPHANUMERIC, byteClass, optimalSegments, segmentBits, type Segment } from "./segment";
import {
  countBits,
  dataCodewords,
  EC_LEVELS,
  ECC_CODEWORDS_PER_BLOCK,
  MAX_BYTES,
  MAX_VERSION,
  MIN_VERSION,
  MODES,
  NUM_EC_BLOCKS,
  symbolSize,
  totalCodewords,
  type EcLevel,
  type Mode,
} from "./tables";

export interface EncodeOptions {
  /** Error-correction level. Default `"M"`. */
  ecLevel?: EcLevel;
  /** Smallest version (1–40) to consider. Default 1. */
  minVersion?: number;
  /** Force a mask pattern (0–7) instead of picking the lowest-penalty one. */
  mask?: number;
  /**
   * `"auto"` (default) splits the payload into numeric, alphanumeric and
   * byte segments to minimise the symbol size. A mode name forces one
   * segment in that mode; it throws if the payload has characters outside it.
   */
  mode?: Mode | "auto";
  /**
   * Start the symbol with an ECI designator declaring UTF-8 (assignment 26).
   * Costs 12 bits. Default `false`: most readers already detect UTF-8, and
   * some older ones mishandle ECI.
   */
  eci?: boolean;
}

/** An encoded QR symbol. */
export interface QrCode {
  /** `modules[y][x]` — `true` is a dark module. No quiet zone included. */
  modules: boolean[][];
  /** Side length in modules (`version * 4 + 17`). */
  size: number;
  /** Symbol version, 1–40. */
  version: number;
  /** Error-correction level used. */
  ecLevel: EcLevel;
  /** Mask pattern applied, 0–7. */
  mask: number;
  /** Length of the encoded payload in bytes. */
  bytes: number;
  /** The segments the payload was split into, in order. */
  segments: Segment[];
}

/** Thrown when the payload does not fit in a version-40 symbol. */
export class QrTooLongError extends RangeError {
  /** Payload length in bytes. */
  readonly bytes: number;
  /** The EC level that was requested. */
  readonly ecLevel: EcLevel;
  /** The most bytes this EC level (and minVersion) could have held. */
  readonly maxBytes: number;

  constructor(bytes: number, ecLevel: EcLevel, maxBytes: number = MAX_BYTES[ecLevel]) {
    super(
      `QR payload of ${bytes} bytes does not fit in a version-40 symbol at EC level ${ecLevel} ` +
        `(at most ${maxBytes} bytes in byte mode; digits and uppercase text pack tighter).`,
    );
    this.name = "QrTooLongError";
    this.bytes = bytes;
    this.ecLevel = ecLevel;
    this.maxBytes = maxBytes;
  }
}

class BitBuffer {
  readonly bits: number[] = [];
  push(value: number, length: number) {
    for (let i = length - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
  }
}

/** Write each segment's mode indicator, character count and payload. */
function writeSegments(bb: BitBuffer, data: Uint8Array, segments: readonly Segment[], version: number) {
  let i = 0;
  for (const { mode, length } of segments) {
    const end = i + length;
    bb.push(1 << MODES.indexOf(mode), 4); // 0001, 0010, 0100
    bb.push(length, countBits(mode, version));
    if (mode === "numeric") {
      for (; i < end; i += 3) {
        const k = Math.min(3, end - i);
        let v = 0;
        for (let j = 0; j < k; j++) v = v * 10 + data[i + j] - 48;
        bb.push(v, k * 3 + 1); // 3 digits → 10 bits, 2 → 7, 1 → 4
      }
    } else if (mode === "alphanumeric") {
      const code = (b: number) => ALPHANUMERIC.indexOf(String.fromCharCode(b));
      for (; i < end; i += 2) {
        if (i + 1 < end) bb.push(code(data[i]) * 45 + code(data[i + 1]), 11);
        else bb.push(code(data[i]), 6);
      }
    } else {
      for (; i < end; i++) bb.push(data[i], 8);
    }
    i = end; // the numeric and alphanumeric loops step past a short last group
  }
}

/** Data codewords (segments, terminator, padding) plus EC, interleaved. */
export function buildCodewords(
  bytes: Uint8Array,
  segments: readonly Segment[],
  version: number,
  ec: EcLevel,
  eci = false,
): Uint8Array {
  const capacity = dataCodewords(version, ec) * 8;
  const bb = new BitBuffer();
  if (eci) bb.push(0x71a, 12); // ECI mode 0111, then assignment 26 as 00011010
  writeSegments(bb, bytes, segments, version);

  bb.push(0, Math.min(4, capacity - bb.bits.length)); // terminator
  while (bb.bits.length % 8 !== 0) bb.bits.push(0);
  for (let pad = 0xec; bb.bits.length < capacity; pad ^= 0xec ^ 0x11) bb.push(pad, 8);

  const codewords = new Uint8Array(bb.bits.length / 8);
  bb.bits.forEach((bit, i) => {
    if (bit) codewords[i >>> 3] |= 1 << (7 - (i & 7));
  });

  // Split into blocks (short blocks first), compute each block's EC, then
  // interleave the data columns followed by the EC columns.
  const blockCount = NUM_EC_BLOCKS[ec][version];
  const ecLen = ECC_CODEWORDS_PER_BLOCK[ec][version];
  const total = totalCodewords(version);
  const shortLen = Math.floor(total / blockCount) - ecLen;
  const numShort = blockCount - (total % blockCount);

  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];
  for (let i = 0, offset = 0; i < blockCount; i++) {
    const len = shortLen + (i < numShort ? 0 : 1);
    const block = codewords.subarray(offset, offset + len);
    offset += len;
    dataBlocks.push(block);
    ecBlocks.push(ecCodewords(block, ecLen));
  }

  const out = new Uint8Array(total);
  let k = 0;
  for (let i = 0; i <= shortLen; i++) {
    for (const b of dataBlocks) if (i < b.length) out[k++] = b[i];
  }
  for (let i = 0; i < ecLen; i++) for (const b of ecBlocks) out[k++] = b[i];
  return out;
}

/** UTF-8 bytes of a string, or a byte array passed through unchanged. */
export function toBytes(data: string | Uint8Array): Uint8Array {
  if (typeof data === "string") return new TextEncoder().encode(data);
  if (data instanceof Uint8Array) return data;
  throw new TypeError("encode() expects a string or a Uint8Array");
}

function checkInt(name: string, value: number, min: number, max: number) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} must be an integer from ${min} to ${max}, got ${value}`);
  }
}

/**
 * Encode a payload as the smallest QR symbol that fits at the requested EC
 * level. Unless `mask` is given, all eight masks are tried and the one with
 * the lowest penalty score wins.
 *
 * By default the payload is split into numeric, alphanumeric and byte
 * segments, choosing the split with the fewest bits for each version range
 * (the character-count fields widen at versions 10 and 27).
 *
 * Strings are encoded as UTF-8 (via `TextEncoder`), so Arabic, CJK and emoji
 * survive the round trip; lone surrogates become U+FFFD. Unless `eci` is set
 * no ECI header is written: ISO/IEC 18004 nominally defaults byte mode to
 * ISO-8859-1, but mainstream readers (iOS and Android cameras, ZXing, jsQR)
 * detect UTF-8. A `Uint8Array` is taken as raw bytes and decodes back exactly
 * as given.
 *
 * @throws {QrTooLongError} if the payload exceeds a version-40 symbol.
 * @throws {RangeError} on an invalid option.
 * @throws {TypeError} if the payload is neither a string nor a Uint8Array.
 */
export function encode(
  input: string | Uint8Array,
  options: EncodeOptions | EcLevel = {},
): QrCode {
  const opts: EncodeOptions = typeof options === "string" ? { ecLevel: options } : options;
  const ec = opts.ecLevel ?? "M";
  if (!EC_LEVELS.includes(ec)) {
    throw new RangeError(`ecLevel must be one of L, M, Q, H, got ${String(ec)}`);
  }
  const minVersion = opts.minVersion ?? MIN_VERSION;
  checkInt("minVersion", minVersion, MIN_VERSION, MAX_VERSION);
  if (opts.mask !== undefined) checkInt("mask", opts.mask, 0, 7);

  const mode = opts.mode ?? "auto";
  const forced = MODES.indexOf(mode as Mode);
  if (mode !== "auto" && forced < 0) {
    throw new RangeError(`mode must be auto, numeric, alphanumeric or byte, got ${String(mode)}`);
  }

  const bytes = toBytes(input);
  if (forced >= 0 && bytes.some((b) => byteClass(b) > forced)) {
    throw new RangeError(`the payload has characters that ${mode} mode cannot encode`);
  }

  // Segmentation depends only on the version range, so compute it at most
  // three times.
  const byRange: Segment[][] = [];
  let version = 0;
  let segments: Segment[] = [];
  for (let v = minVersion; v <= MAX_VERSION; v++) {
    const range = v <= 9 ? 0 : v <= 26 ? 1 : 2;
    segments = byRange[range] ??=
      forced >= 0 ? [{ mode: mode as Mode, length: bytes.length }] : optimalSegments(bytes, v);
    if (segmentBits(segments, v) + (opts.eci ? 12 : 0) <= dataCodewords(v, ec) * 8) {
      version = v;
      break;
    }
  }
  if (version === 0) throw new QrTooLongError(bytes.length, ec);

  const data = buildCodewords(bytes, segments, version, ec, opts.eci);
  const base = functionGrid(version);
  placeCodewords(base, data);

  const candidates = opts.mask !== undefined ? [opts.mask] : [0, 1, 2, 3, 4, 5, 6, 7];
  let best: { grid: Grid; mask: number; score: number } | undefined;
  for (const mask of candidates) {
    const g: Grid = {
      size: base.size,
      modules: base.modules.map((row) => row.slice()),
      reserved: base.reserved,
    };
    applyMask(g, mask);
    drawFormat(g, ec, mask);
    const score = candidates.length === 1 ? 0 : penalty(g.modules, g.size);
    if (!best || score < best.score) best = { grid: g, mask, score };
  }

  return {
    modules: best!.grid.modules,
    size: symbolSize(version),
    version,
    ecLevel: ec,
    mask: best!.mask,
    bytes: bytes.length,
    segments,
  };
}
