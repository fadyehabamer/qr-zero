import { test } from "node:test";
import assert from "node:assert/strict";
import { byteCapacity, encode, MAX_BYTES, QrTooLongError } from "../src/index";
import { buildCodewords } from "../src/encode";
import { EC_LEVELS } from "../src/tables";

const utf8 = (s: string) => new TextEncoder().encode(s);

test("defaults: EC level M, smallest version, a mask in 0–7", () => {
  const qr = encode("hello");
  assert.equal(qr.ecLevel, "M");
  assert.equal(qr.version, 1);
  assert.equal(qr.size, 21);
  assert.equal(qr.bytes, 5);
  assert.ok(qr.mask >= 0 && qr.mask <= 7);
  assert.equal(qr.modules.length, 21);
  assert.ok(qr.modules.every((row) => row.length === 21));
});

test("EC level can be passed as a string or an option", () => {
  assert.equal(encode("a", "H").ecLevel, "H");
  assert.equal(encode("a", { ecLevel: "Q" }).ecLevel, "Q");
});

test("version boundaries: capacity fits, capacity + 1 moves up a version", () => {
  for (const ec of EC_LEVELS) {
    for (let v = 1; v <= 40; v++) {
      const cap = byteCapacity(v, ec);
      assert.equal(encode("a".repeat(cap), ec).version, v, `${ec} v${v} at capacity`);
      if (v < 40) assert.equal(encode("a".repeat(cap + 1), ec).version, v + 1);
    }
  }
});

test("MAX_BYTES fits; one byte more throws QrTooLongError", () => {
  for (const ec of EC_LEVELS) {
    const qr = encode("z".repeat(MAX_BYTES[ec]), ec);
    assert.equal(qr.version, 40);
    assert.equal(qr.size, 177);
    assert.throws(
      () => encode("z".repeat(MAX_BYTES[ec] + 1), ec),
      (err: unknown) => {
        assert.ok(err instanceof QrTooLongError);
        assert.ok(err instanceof RangeError);
        assert.equal(err.name, "QrTooLongError");
        assert.equal(err.bytes, MAX_BYTES[ec] + 1);
        assert.equal(err.ecLevel, ec);
        assert.equal(err.maxBytes, MAX_BYTES[ec]);
        return true;
      },
    );
  }
});

test("capacity is measured in UTF-8 bytes, not characters", () => {
  const arabic = "م".repeat(Math.floor(MAX_BYTES.H / 2)); // 2 bytes each
  assert.equal(encode(arabic, "H").bytes, arabic.length * 2);
  assert.throws(() => encode(arabic + "م", "H"), QrTooLongError);
  assert.equal(encode("😀").bytes, 4);
});

test("string and equivalent Uint8Array produce the same symbol", () => {
  const text = "سلام 👋 qr-zero";
  const a = encode(text, { mask: 3 });
  const b = encode(new TextEncoder().encode(text), { mask: 3 });
  assert.deepEqual(a, b);
});

test("raw bytes pass through untouched", () => {
  const bytes = new Uint8Array([0x00, 0xff, 0x80, 0xfe]);
  assert.equal(encode(bytes).bytes, 4);
});

test("minVersion and a forced mask are honoured", () => {
  const qr = encode("hi", { minVersion: 5, mask: 6 });
  assert.equal(qr.version, 5);
  assert.equal(qr.mask, 6);
  // minVersion is a floor, not a cap.
  assert.equal(encode("a".repeat(80), { minVersion: 2, ecLevel: "H" }).version, 8);
});

test("automatic mask selection is deterministic", () => {
  const a = encode("deterministic?", "L");
  const b = encode("deterministic?", "L");
  assert.deepEqual(a, b);
});

test("invalid options throw", () => {
  assert.throws(() => encode("a", { ecLevel: "X" as never }), RangeError);
  assert.throws(() => encode("a", { mask: 8 }), RangeError);
  assert.throws(() => encode("a", { mask: 1.5 }), RangeError);
  assert.throws(() => encode("a", { minVersion: 0 }), RangeError);
  assert.throws(() => encode("a", { minVersion: 41 }), RangeError);
  assert.throws(() => encode(42 as never), TypeError);
});

test("the empty string encodes", () => {
  const qr = encode("");
  assert.equal(qr.version, 1);
  assert.equal(qr.bytes, 0);
});

test("eci: off by default, adds a 12-bit UTF-8 designator when set", () => {
  const plain = buildCodewords(utf8("é"), [{ mode: "byte", length: 2 }], 1, "M");
  assert.equal(plain[0] >>> 4, 0b0100, "starts with the byte-mode indicator");
  const eci = buildCodewords(utf8("é"), [{ mode: "byte", length: 2 }], 1, "M", true);
  assert.equal(eci[0], 0x71, "ECI mode 0111, assignment 0001…");
  assert.equal(eci[1] >>> 4, 0b1010, "…1010 = 26 (UTF-8)");
  assert.equal(eci[1] & 0xf, 0b0100, "then the byte segment");
});

test("eci: the 12 extra bits count towards version selection", () => {
  for (const ec of EC_LEVELS) {
    const cap = byteCapacity(5, ec);
    assert.equal(encode("a".repeat(cap), { ecLevel: ec }).version, 5);
    assert.equal(encode("a".repeat(cap), { ecLevel: ec, eci: true }).version, 6);
    assert.equal(encode("a".repeat(cap - 2), { ecLevel: ec, eci: true }).version, 5);
  }
  assert.throws(() => encode("z".repeat(MAX_BYTES.L), { ecLevel: "L", eci: true }), QrTooLongError);
});
