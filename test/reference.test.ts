import { test } from "node:test";
import assert from "node:assert/strict";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { byteCapacity, capacity, encode, type EcLevel, type QrCode } from "../src/index";
import {
  ALPHANUMERIC,
  ARABIC_EMOJI,
  ASCII,
  DIGITS,
  mixedText,
  randomChars,
  randomText,
  rasterize,
  rng,
} from "./helpers";

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

for (const mode of ["numeric", "alphanumeric"] as const) {
  test(`matches qrcode module-for-module, ${mode} mode, every version and EC level`, () => {
    const pool = mode === "numeric" ? DIGITS : ALPHANUMERIC;
    for (const ec of LEVELS) {
      const next = rng(ec.charCodeAt(0) + mode.length);
      for (let v = 1; v <= 40; v++) {
        const lo = v === 1 ? 1 : capacity(v - 1, ec, mode) + 1;
        const len = lo + Math.floor(next() * (capacity(v, ec, mode) - lo + 1));
        const text = randomChars(len, pool, v * 31);
        const qr = encode(text, { ecLevel: ec, mode });
        assert.equal(qr.version, v);
        assertMatchesReference(qr, new TextEncoder().encode(text));
      }
    }
  });
}

test("matches qrcode module-for-module on mixed segmentations", () => {
  let multi = 0;
  for (let i = 0; i < 160; i++) {
    const text = mixedText(1 + (i % 12), i);
    const qr = encode(text, LEVELS[i % 4]);
    if (qr.segments.length > 1) multi++;
    assertMatchesReference(qr, new TextEncoder().encode(text));
  }
  assert.ok(multi > 100, `only ${multi} inputs had more than one segment`);
});

/**
 * `qrcode` optimises its segments for an estimated version rather than per
 * version range, so its split can legitimately differ. Where it matches,
 * the symbols must match module for module; where it differs, both must
 * decode to the same text and qr-zero must never need a larger version.
 */
test("agrees with qrcode's own automatic segmentation", () => {
  let same = 0;
  let different = 0;
  const inputs = [
    "0123456789",
    "HELLO WORLD",
    "HTTPS://EXAMPLE.COM/PATH?Q=1",
    "https://example.com/?id=12345678901234567890",
    "ORDER-000123456789/ABC",
    ...Array.from({ length: 80 }, (_, i) => mixedText(1 + (i % 9), 1000 + i)),
  ];
  for (const [i, text] of inputs.entries()) {
    const ec = LEVELS[i % 4];
    const qr = encode(text, ec);
    const auto = QRCode.create(text, { errorCorrectionLevel: ec });
    const theirs = auto.segments.map((s) => `${s.mode.id.toLowerCase()}:${s.getLength()}`);
    const ours = qr.segments.map((s) => `${s.mode}:${s.length}`);
    assert.ok(qr.version <= auto.version, `"${text}": v${qr.version} > qrcode's v${auto.version}`);
    if (theirs.join() === ours.join() && auto.version === qr.version) {
      same++;
      assertMatchesReference(qr, new TextEncoder().encode(text));
    } else {
      different++;
      const size = auto.modules.size;
      const modules = Array.from({ length: size }, (_, y) =>
        Array.from({ length: size }, (_, x) => Boolean(auto.modules.get(y, x))),
      );
      for (const symbol of [qr, { ...qr, size, modules }]) {
        const { data, width, height } = rasterize(symbol);
        const decoded = jsQR(data, width, height, { inversionAttempts: "dontInvert" });
        assert.equal(decoded?.data, text);
      }
    }
  }
  assert.equal(same + different, inputs.length);
  assert.ok(same > inputs.length / 2, `segmentations matched for only ${same} inputs`);
});
