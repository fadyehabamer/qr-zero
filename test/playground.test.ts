import { test } from "node:test";
import assert from "node:assert/strict";
import jsQR from "jsqr";
import { dataCodewords, encode, toSvg, type EncodeOptions } from "../src/index";
import { segmentBits } from "../src/segment";
import { escapeVCard, escapeWifi, vCardPayload, wifiPayload } from "../playground/src/payloads";
import { DEFAULTS, encodeOptions, snippet, svgOptions, type PlaygroundOptions } from "../playground/src/snippet";
import { usedBits, utf8Length } from "../playground/src/stats";
import { rasterize } from "./helpers";

test("playground: Wi-Fi fields escape backslash, semicolon, comma, colon and quote", () => {
  assert.equal(escapeWifi("plain"), "plain");
  assert.equal(escapeWifi(`a\\b;c,d:e"f`), `a\\\\b\\;c\\,d\\:e\\"f`);
  assert.equal(escapeWifi("مقهى ☕"), "مقهى ☕");
});

test("playground: Wi-Fi payload matches the WIFI: URI format", () => {
  assert.equal(wifiPayload({ ssid: "Home", password: "secret" }), "WIFI:T:WPA;S:Home;P:secret;;");
  assert.equal(
    wifiPayload({ ssid: "Café;Bar", password: 'p:a,s"s\\', security: "WEP", hidden: true }),
    `WIFI:T:WEP;S:Café\\;Bar;P:p\\:a\\,s\\"s\\\\;H:true;;`,
  );
  assert.equal(wifiPayload({ ssid: "Guest", password: "ignored", security: "nopass" }), "WIFI:T:nopass;S:Guest;;");
});

test("playground: an escaped Wi-Fi payload survives a jsQR round trip", () => {
  const text = wifiPayload({ ssid: "My;Net", password: 'a"b\\c' });
  const qr = encode(text, "Q");
  const { data, width, height } = rasterize(qr);
  assert.equal(jsQR(data, width, height, { inversionAttempts: "dontInvert" })?.data, text);
});

test("playground: vCard values are escaped and empty fields left out", () => {
  assert.equal(escapeVCard("a,b;c\\d\ne"), "a\\,b\\;c\\\\d\\ne");
  assert.equal(
    vCardPayload({ firstName: " Fady ", lastName: "Amer", org: "Acme, Inc.", email: "a@example.com" }),
    ["BEGIN:VCARD", "VERSION:3.0", "N:Amer;Fady;;;", "FN:Fady Amer", "ORG:Acme\\, Inc.", "EMAIL:a@example.com", "END:VCARD"].join("\n"),
  );
});

test("playground: snippet leaves out options that match the defaults", () => {
  assert.equal(
    snippet({ ...DEFAULTS, text: "hello" }),
    'import { encode, toSvg } from "qr-zero";\n\nconst qr = encode("hello");\nconst svg = toSvg(qr);\n',
  );
});

test("playground: snippet lists every changed option and escapes the text", () => {
  const code = snippet({
    ...DEFAULTS,
    text: 'say "hi"\nمرحبا',
    ecLevel: "Q",
    mode: "byte",
    eci: true,
    minVersion: 5,
    mask: 0,
    margin: 2,
    moduleSize: 8,
    dark: "#1D4ED8",
    transparent: true,
  });
  assert.ok(
    code.includes(`encode("say \\"hi\\"\\nمرحبا", { ecLevel: "Q", mode: "byte", eci: true, minVersion: 5, mask: 0 });`),
  );
  assert.ok(code.includes(`toSvg(qr, { margin: 2, moduleSize: 8, dark: "#1D4ED8", light: null });`));
});

test("playground: running the snippet reproduces the playground's SVG", () => {
  const cases: PlaygroundOptions[] = [
    { ...DEFAULTS, text: "https://example.com" },
    { ...DEFAULTS, text: "HELLO 123", ecLevel: "H", mode: "alphanumeric", mask: 5, light: "#FFFBEB" },
    { ...DEFAULTS, text: "مرحبا </script>", eci: true, minVersion: 7, margin: 0, dark: "#0f766e", transparent: true },
  ];
  for (const o of cases) {
    const body = snippet(o).replace(/^import .*\n/, "") + "return svg;";
    const run = new Function("encode", "toSvg", body) as (e: typeof encode, s: typeof toSvg) => string;
    assert.equal(run(encode, toSvg), toSvg(encode(o.text, encodeOptions(o)), svgOptions(o)));
  }
});

test("playground: data bits used match the encoder and fit the version", () => {
  const inputs: [string, EncodeOptions][] = [
    ["", {}],
    ["hello", {}],
    ["12345678901234567890", {}],
    ["https://example.com/track?id=12345678901234567890", { ecLevel: "Q" }],
    ["HELLO WORLD", { mode: "byte", eci: true }],
    ["9".repeat(500), { minVersion: 12 }],
    ["x".repeat(1500), { ecLevel: "L" }],
  ];
  for (const [text, options] of inputs) {
    const qr = encode(text, options);
    const bits = usedBits(qr.segments, qr.version, options.eci);
    assert.equal(bits, segmentBits(qr.segments, qr.version) + (options.eci ? 12 : 0));
    assert.ok(bits <= dataCodewords(qr.version, qr.ecLevel) * 8);
    assert.equal(utf8Length(text), qr.bytes);
  }
});
