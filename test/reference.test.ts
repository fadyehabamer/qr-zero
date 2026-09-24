import { test } from "node:test";
import assert from "node:assert/strict";
import QRCode from "qrcode";
import { byteCapacity, encode, type EcLevel, type QrCode } from "../src/index";
import { ARABIC_EMOJI, ASCII, randomText, rng } from "./helpers";

const LEVELS: EcLevel[] = ["L", "M", "Q", "H"];

/**
 * Build the same symbol with the `qrcode` package — forcing the segments,
 * version and mask qr-zero chose — and compare every module. (Mask
 * *selection* is not compared: `qrcode` scores penalty rule 3 differently,
 * so the two libraries sometimes pick different, equally valid masks.)
 */
function assertMatchesReference(qr: QrCode, payload: Uint8Array) {
  let at = 0;
  const segments = qr.segments.map(({ mode, length }) => {
    const part = payload.subarray(at, (at += length));
    return mode === "byte"
      ? { data: part, mode }
      : { data: String.fromCharCode(...part), mode };
  });
  const ref = QRCode.create(segments, {
    errorCorrectionLevel: qr.ecLevel,
    version: qr.version,
    maskPattern: qr.mask as QRCode.QRCodeMaskPattern,
  });
  assert.equal(ref.version, qr.version);
  assert.equal(ref.modules.size, qr.size);
  let diff = 0;
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (Boolean(ref.modules.get(y, x)) !== qr.modules[y][x]) diff++;
    }
  }
  assert.equal(diff, 0, `${qr.ecLevel} v${qr.version} mask ${qr.mask}: ${diff} modules differ`);
}

const check = (text: string, options: Parameters<typeof encode>[1]) =>
  assertMatchesReference(encode(text, options), new TextEncoder().encode(text));

for (const ec of LEVELS) {
  test(`matches qrcode module-for-module, EC ${ec}, versions 1–40 (byte mode)`, () => {
    const next = rng(ec.charCodeAt(0));
    for (let v = 1; v <= 40; v++) {
      // A random length inside this version's range, so padding varies.
      const lo = v === 1 ? 0 : byteCapacity(v - 1, ec) + 1;
      const len = lo + Math.floor(next() * (byteCapacity(v, ec) - lo + 1));
      const text = randomText(len, v % 2 ? ASCII : ARABIC_EMOJI, v * 17);
      const qr = encode(text, { ecLevel: ec, mode: "byte" });
      assert.equal(qr.version, v);
      assertMatchesReference(qr, new TextEncoder().encode(text));
    }
  });
}

test("matches qrcode for every mask at several versions", () => {
  for (const v of [1, 6, 7, 14, 23, 32, 40]) {
    for (let mask = 0; mask < 8; mask++) {
      check(`mask ${mask} · v${v} · مرحبا 👋`, { ecLevel: LEVELS[mask % 4], minVersion: v, mask });
    }
  }
});

test("matches qrcode at exact byte-mode version capacities", () => {
  for (const ec of LEVELS) {
    for (const v of [1, 9, 10, 26, 27, 40]) {
      check(randomText(byteCapacity(v, ec), ASCII, v), { ecLevel: ec, mode: "byte" });
    }
  }
});
