import { test } from "node:test";
import assert from "node:assert/strict";
import jsQR from "jsqr";
import { byteCapacity, encode, MAX_BYTES, type EcLevel, type EncodeOptions } from "../src/index";
import { capacity } from "../src/index";
import {
  ALPHANUMERIC,
  ARABIC_EMOJI,
  ASCII,
  DIGITS,
  mixedText,
  randomChars,
  randomText,
  rasterize,
} from "./helpers";

const LEVELS: EcLevel[] = ["L", "M", "Q", "H"];

/**
 * jsQR 1.4.0 lists version 23's alignment centres as [6, 30, 54, 74, 102];
 * ISO/IEC 18004 Annex E (and qr-zero) has 78, not 74. It therefore misreads
 * the modules around one alignment row. At M/Q/H Reed–Solomon absorbs the
 * damage; at L it cannot, so jsQR fails on every 23-L symbol from any
 * encoder. That combination is skipped here and covered module-for-module
 * by the reference comparison in reference.test.ts instead.
 */
const JSQR_UNREADABLE = new Set(["23-L"]);

/** Encode, rasterise, decode with jsQR, and check bytes and version survive. */
function roundTrip(text: string, ec: EcLevel, expectVersion?: number, options: EncodeOptions = {}) {
  const qr = encode(text, { ...options, ecLevel: ec });
  if (expectVersion !== undefined) assert.equal(qr.version, expectVersion);
  const { data, width, height } = rasterize(qr);
  const decoded = jsQR(data, width, height, { inversionAttempts: "dontInvert" });
  assert.ok(decoded, `jsQR could not read ${ec} v${qr.version} (${qr.bytes} bytes)`);
  assert.equal(decoded.version, qr.version);
  assert.deepEqual(Uint8Array.from(decoded.binaryData), new TextEncoder().encode(text));
  assert.deepEqual(
    decoded.chunks.map((c) => c.type),
    qr.segments.map((s) => s.mode),
    "jsQR saw the segments qr-zero wrote",
  );
  return decoded;
}

for (const ec of LEVELS) {
  test(`jsQR round-trip, EC ${ec}: every version 1–40 filled to byte capacity (ASCII)`, () => {
    for (let v = 1; v <= 40; v++) {
      if (JSQR_UNREADABLE.has(`${v}-${ec}`)) continue;
      const text = randomText(byteCapacity(v, ec), ASCII, v * 131 + ec.charCodeAt(0));
      roundTrip(text, ec, v, { mode: "byte" });
    }
  });
}

test("jsQR round-trip: Arabic and emoji UTF-8 across versions and EC levels", () => {
  for (const ec of LEVELS) {
    for (const v of [1, 2, 5, 9, 10, 17, 26, 27, 33, 40]) {
      const text = randomText(byteCapacity(v, ec), ARABIC_EMOJI, v * 7 + ec.charCodeAt(0));
      const decoded = roundTrip(text, ec, v);
      assert.equal(decoded.data, text, "jsQR's own UTF-8 decode agrees");
    }
  }
});

test("jsQR round-trip: short and near-max payloads", () => {
  const cases = [
    "",
    "a",
    "https://github.com/fadyehabamer/qr-zero",
    "WIFI:T:WPA;S:café;P:p@ss w0rd;;",
    "مرحبا بالعالم 👋🏽🇪🇬",
  ];
  for (const ec of LEVELS) {
    for (const text of cases) roundTrip(text, ec);
    roundTrip(randomText(MAX_BYTES[ec], ASCII, 40), ec, 40);
    roundTrip(randomText(MAX_BYTES[ec] - 1, ARABIC_EMOJI, 41), ec, 40);
  }
});

test("jsQR round-trip: every forced mask decodes", () => {
  for (let mask = 0; mask < 8; mask++) {
    const text = "mask " + mask + " ✓";
    const qr = encode(text, { ecLevel: "Q", mask, minVersion: 3 });
    const { data, width, height } = rasterize(qr);
    const decoded = jsQR(data, width, height, { inversionAttempts: "dontInvert" });
    assert.equal(decoded?.data, text);
  }
});

for (const mode of ["numeric", "alphanumeric"] as const) {
  test(`jsQR round-trip: ${mode} mode, every version filled to capacity`, () => {
    const pool = mode === "numeric" ? DIGITS : ALPHANUMERIC;
    for (const ec of LEVELS) {
      for (let v = 1; v <= 40; v++) {
        if (JSQR_UNREADABLE.has(`${v}-${ec}`)) continue;
        const text = randomChars(capacity(v, ec, mode), pool, v * 53 + ec.charCodeAt(0));
        roundTrip(text, ec, v, { mode });
      }
    }
  });
}

test("jsQR round-trip: automatic mixed segmentation", () => {
  const cases = [
    "0",
    "12",
    "HELLO WORLD",
    "HTTPS://GITHUB.COM/FADYEHABAMER/QR-ZERO",
    "tel:+201234567890",
    "Invoice 2026-000123456789, total EGP 1234567.89",
    "مرحبا 0123456789012345 👋",
  ];
  for (const ec of LEVELS) {
    for (const text of cases) roundTrip(text, ec);
    for (let i = 0; i < 40; i++) roundTrip(mixedText(1 + (i % 15), i * 7 + ec.charCodeAt(0)), ec);
  }
});

test("jsQR round-trip: an ECI UTF-8 designator is read and the text survives", () => {
  for (const ec of LEVELS) {
    for (const text of ["", "HELLO 123", "مرحبا بالعالم 👋🏽🇪🇬", "café 0123456789012345 ABC"]) {
      const qr = encode(text, { ecLevel: ec, eci: true });
      const { data, width, height } = rasterize(qr);
      const decoded = jsQR(data, width, height, { inversionAttempts: "dontInvert" });
      assert.ok(decoded, `jsQR could not read "${text}" with ECI`);
      assert.deepEqual(decoded.chunks[0], { type: "eci", assignmentNumber: 26 });
      assert.equal(decoded.data, text);
    }
  }
});
