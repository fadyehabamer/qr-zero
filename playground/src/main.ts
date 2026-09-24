import {
  byteCapacity,
  dataCodewords,
  encode,
  MAX_BYTES,
  QrTooLongError,
  toCanvas,
  toSvg,
  type EcLevel,
  type Mode,
  type QrCode,
} from "qr-zero";
import { vCardPayload, wifiPayload, type WifiSecurity } from "./payloads";
import { encodeOptions, snippet, svgOptions, type PlaygroundOptions } from "./snippet";
import { usedBits, utf8Length } from "./stats";

declare const QR_ZERO_VERSION: string;

const byId = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

const els = {
  text: byId<HTMLTextAreaElement>("text"),
  textCount: byId("text-count"),
  mode: byId<HTMLSelectElement>("mode"),
  mask: byId<HTMLSelectElement>("mask"),
  minVersion: byId<HTMLInputElement>("min-version"),
  eci: byId<HTMLInputElement>("eci"),
  margin: byId<HTMLInputElement>("margin"),
  marginValue: byId<HTMLOutputElement>("margin-value"),
  moduleSize: byId<HTMLInputElement>("module-size"),
  moduleSizeValue: byId<HTMLOutputElement>("module-size-value"),
  dark: byId<HTMLInputElement>("dark"),
  light: byId<HTMLInputElement>("light"),
  transparent: byId<HTMLInputElement>("transparent"),
  contrast: byId("contrast"),
  preview: byId("preview"),
  error: byId("error"),
  status: byId("status"),
  downloadSvg: byId<HTMLButtonElement>("download-svg"),
  downloadPng: byId<HTMLButtonElement>("download-png"),
  copySvg: byId<HTMLButtonElement>("copy-svg"),
  copyCode: byId<HTMLButtonElement>("copy-code"),
  snippet: byId("snippet"),
  infoVersion: byId("info-version"),
  infoSize: byId("info-size"),
  infoMask: byId("info-mask"),
  infoBytes: byId("info-bytes"),
  infoMeter: byId<HTMLMeterElement>("info-meter"),
  infoCapacity: byId("info-capacity"),
  infoSegments: byId<HTMLOListElement>("info-segments"),
  theme: byId<HTMLSelectElement>("theme"),
  version: byId("version"),
  wifiForm: byId<HTMLFieldSetElement>("wifi-form"),
  wifiSsid: byId<HTMLInputElement>("wifi-ssid"),
  wifiPassword: byId<HTMLInputElement>("wifi-password"),
  wifiSecurity: byId<HTMLSelectElement>("wifi-security"),
  wifiHidden: byId<HTMLInputElement>("wifi-hidden"),
  vcardForm: byId<HTMLFieldSetElement>("vcard-form"),
  vcardFirst: byId<HTMLInputElement>("vcard-first"),
  vcardLast: byId<HTMLInputElement>("vcard-last"),
  vcardOrg: byId<HTMLInputElement>("vcard-org"),
  vcardTitle: byId<HTMLInputElement>("vcard-title"),
  vcardPhone: byId<HTMLInputElement>("vcard-phone"),
  vcardEmail: byId<HTMLInputElement>("vcard-email"),
  vcardUrl: byId<HTMLInputElement>("vcard-url"),
};

const presetButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-preset]"));

type Preset = "url" | "wifi" | "vcard" | "arabic";

const TEXT_PRESETS = {
  url: "https://github.com/fadyehabamer/qr-zero",
  arabic: "مرحبا بالعالم! هذا رمز QR يحمل نصا عربيا بترميز UTF-8.",
} as const;

const SEGMENT_UNITS: Record<Mode, [string, string]> = {
  numeric: ["digit", "digits"],
  alphanumeric: ["character", "characters"],
  byte: ["byte", "bytes"],
};

const plural = (n: number, [one, many]: [string, string]) => `${n.toLocaleString("en")} ${n === 1 ? one : many}`;

const clampInt = (value: string, min: number, max: number, fallback: number): number => {
  const n = Math.round(Number(value));
  return value.trim() === "" || !Number.isFinite(n) ? fallback : Math.min(max, Math.max(min, n));
};

function readOptions(): PlaygroundOptions {
  const checked = document.querySelector<HTMLInputElement>('input[name="ec"]:checked');
  return {
    text: els.text.value,
    ecLevel: (checked?.value ?? "M") as EcLevel,
    mode: els.mode.value as Mode | "auto",
    eci: els.eci.checked,
    minVersion: clampInt(els.minVersion.value, 1, 40, 1),
    mask: els.mask.value === "auto" ? null : Number(els.mask.value),
    margin: clampInt(els.margin.value, 0, 10, 4),
    moduleSize: clampInt(els.moduleSize.value, 1, 20, 4),
    dark: els.dark.value,
    light: els.light.value,
    transparent: els.transparent.checked,
  };
}

const luminance = (hex: string): number => {
  const n = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

function updateContrast(o: PlaygroundOptions) {
  if (o.transparent) {
    els.contrast.hidden = true;
    return;
  }
  const dark = luminance(o.dark);
  const light = luminance(o.light);
  const ratio = (Math.max(dark, light) + 0.05) / (Math.min(dark, light) + 0.05);
  if (dark > light) {
    els.contrast.textContent = "The dark modules are lighter than the background. Many scanners cannot read inverted codes.";
  } else if (ratio < 3) {
    els.contrast.textContent = `Low contrast (${ratio.toFixed(1)}:1) between the colours. Some scanners may not read the code.`;
  } else {
    els.contrast.hidden = true;
    return;
  }
  els.contrast.hidden = false;
}

let current: { qr: QrCode; svg: string; options: PlaygroundOptions } | null = null;

function setOutputEnabled(enabled: boolean) {
  for (const button of [els.downloadSvg, els.downloadPng, els.copySvg]) button.disabled = !enabled;
}

function clearDetails() {
  for (const el of [els.infoVersion, els.infoSize, els.infoMask]) el.textContent = "–";
  els.infoSegments.replaceChildren();
}

function errorContent(err: unknown, o: PlaygroundOptions): [string, string] {
  if (err instanceof QrTooLongError) {
    const lower = err.ecLevel === "L" ? "" : " or pick a lower error-correction level";
    return [
      "Too long for a QR code",
      `This text is ${plural(err.bytes, ["byte", "bytes"])}. At level ${err.ecLevel} the largest QR code holds ${err.maxBytes.toLocaleString("en")} bytes in byte mode (more for digits or uppercase text). Shorten the text${lower}.`,
    ];
  }
  if (err instanceof RangeError && o.mode !== "auto") {
    const allowed =
      o.mode === "numeric" ? "digits 0–9" : "0–9, A–Z, space and $ % * + - . / :";
    return [`Not encodable in ${o.mode} mode`, `${o.mode[0].toUpperCase()}${o.mode.slice(1)} mode takes only ${allowed}. Switch the mode to Auto or Byte.`];
  }
  return ["Could not encode", err instanceof Error ? err.message : String(err)];
}

function showError(err: unknown, o: PlaygroundOptions) {
  current = null;
  const [title, body] = errorContent(err, o);
  const heading = document.createElement("strong");
  heading.textContent = title;
  const text = document.createElement("p");
  text.textContent = body;
  els.error.replaceChildren(heading, text);
  els.error.hidden = false;
  els.preview.classList.add("stale");
  els.preview.setAttribute("aria-label", "No QR code: the current input cannot be encoded");
  setOutputEnabled(false);
  clearDetails();
  const bytes = utf8Length(o.text);
  els.infoBytes.textContent = plural(bytes, ["byte", "bytes"]);
  els.infoMeter.value = 1;
  els.infoCapacity.textContent = `Level ${o.ecLevel} holds at most ${MAX_BYTES[o.ecLevel].toLocaleString("en")} bytes in byte mode.`;
}

function showDetails(qr: QrCode, o: PlaygroundOptions) {
  const px = (qr.size + o.margin * 2) * o.moduleSize;
  els.infoVersion.textContent = o.minVersion > 1 ? `${qr.version} (min ${o.minVersion})` : String(qr.version);
  els.infoSize.textContent = `${qr.size} × ${qr.size} modules, ${px} px`;
  els.infoMask.textContent = `${qr.mask} (${o.mask === null ? "auto" : "forced"})`;
  els.infoBytes.textContent = plural(qr.bytes, ["byte", "bytes"]);

  const used = usedBits(qr.segments, qr.version, o.eci);
  const total = dataCodewords(qr.version, qr.ecLevel) * 8;
  const percent = Math.round((used / total) * 100);
  els.infoMeter.value = used / total;
  els.infoCapacity.textContent =
    `${used.toLocaleString("en")} of ${total.toLocaleString("en")} data bits (${percent}%) in version ${qr.version}-${qr.ecLevel}. ` +
    `Byte-mode capacity: ${byteCapacity(qr.version, qr.ecLevel).toLocaleString("en")} bytes at this version, ` +
    `${MAX_BYTES[qr.ecLevel].toLocaleString("en")} at version 40.`;

  const items: HTMLLIElement[] = [];
  if (o.eci) {
    const li = document.createElement("li");
    li.textContent = "ECI · UTF-8 (26)";
    items.push(li);
  }
  for (const segment of qr.segments) {
    const li = document.createElement("li");
    li.dataset.mode = segment.mode;
    li.textContent = `${segment.mode} · ${plural(segment.length, SEGMENT_UNITS[segment.mode])}`;
    items.push(li);
  }
  els.infoSegments.replaceChildren(...items);
}

function render() {
  const o = readOptions();
  els.marginValue.value = String(o.margin);
  els.moduleSizeValue.value = String(o.moduleSize);
  els.light.disabled = o.transparent;
  els.textCount.textContent = `${plural([...o.text].length, ["character", "characters"])} · ${plural(utf8Length(o.text), ["UTF-8 byte", "UTF-8 bytes"])}`;
  els.snippet.textContent = snippet(o);
  updateContrast(o);

  let qr: QrCode;
  try {
    qr = encode(o.text, encodeOptions(o));
  } catch (err) {
    showError(err, o);
    return;
  }
  const svg = toSvg(qr, svgOptions(o));
  current = { qr, svg, options: o };
  els.preview.innerHTML = svg;
  els.preview.classList.remove("stale");
  els.preview.setAttribute("aria-label", `QR code preview: version ${qr.version}, ${qr.size} by ${qr.size} modules`);
  els.error.hidden = true;
  els.error.replaceChildren();
  setOutputEnabled(true);
  showDetails(qr, o);
}

let timer: number | undefined;
const schedule = (delay: number) => {
  window.clearTimeout(timer);
  timer = window.setTimeout(render, delay);
};

let statusTimer: number | undefined;
function announce(message: string) {
  window.clearTimeout(statusTimer);
  els.status.textContent = "";
  window.requestAnimationFrame(() => {
    els.status.textContent = message;
    statusTimer = window.setTimeout(() => (els.status.textContent = ""), 5000);
  });
}

function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyText(text: string, label: string, trigger: HTMLElement) {
  try {
    await navigator.clipboard.writeText(text);
    announce(`${label} copied to the clipboard.`);
    return;
  } catch {}
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.append(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {}
  area.remove();
  trigger.focus();
  announce(ok ? `${label} copied to the clipboard.` : `Could not copy. Select the ${label.toLowerCase()} and copy it manually.`);
}

function wifiText(): string {
  return wifiPayload({
    ssid: els.wifiSsid.value,
    password: els.wifiPassword.value,
    security: els.wifiSecurity.value as WifiSecurity,
    hidden: els.wifiHidden.checked,
  });
}

function vCardText(): string {
  return vCardPayload({
    firstName: els.vcardFirst.value,
    lastName: els.vcardLast.value,
    org: els.vcardOrg.value,
    title: els.vcardTitle.value,
    phone: els.vcardPhone.value,
    email: els.vcardEmail.value,
    url: els.vcardUrl.value,
  });
}

function fillIfEmpty(pairs: [HTMLInputElement, string][]) {
  if (pairs.some(([input]) => input.value !== "")) return;
  for (const [input, value] of pairs) input.value = value;
}

function setPressed(active: Preset | null) {
  for (const button of presetButtons) button.setAttribute("aria-pressed", String(button.dataset.preset === active));
  els.wifiForm.hidden = active !== "wifi";
  els.vcardForm.hidden = active !== "vcard";
}

function applyPreset(preset: Preset, button: HTMLButtonElement) {
  if (button.getAttribute("aria-pressed") === "true" && (preset === "wifi" || preset === "vcard")) {
    setPressed(null);
    return;
  }
  setPressed(preset);
  if (preset === "wifi") {
    fillIfEmpty([
      [els.wifiSsid, "Café Guest"],
      [els.wifiPassword, "pass;word:1"],
    ]);
    els.text.value = wifiText();
    els.wifiSsid.focus();
  } else if (preset === "vcard") {
    fillIfEmpty([
      [els.vcardFirst, "Layla"],
      [els.vcardLast, "Hassan"],
      [els.vcardOrg, "Example, Inc."],
      [els.vcardTitle, "Engineer"],
      [els.vcardPhone, "+20 100 000 0000"],
      [els.vcardEmail, "layla@example.com"],
      [els.vcardUrl, "https://example.com"],
    ]);
    els.text.value = vCardText();
    els.vcardFirst.focus();
  } else {
    els.text.value = TEXT_PRESETS[preset];
  }
  render();
}

function applyTheme(theme: string) {
  if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
  try {
    if (theme === "light" || theme === "dark") localStorage.setItem("qr-zero-theme", theme);
    else localStorage.removeItem("qr-zero-theme");
  } catch {}
}

els.version.textContent = `qr-zero ${QR_ZERO_VERSION}`;
els.theme.value = document.documentElement.dataset.theme ?? "system";
els.theme.addEventListener("change", () => applyTheme(els.theme.value));

for (const button of presetButtons) {
  button.addEventListener("click", () => applyPreset(button.dataset.preset as Preset, button));
}

els.text.addEventListener("input", () => {
  for (const button of presetButtons) {
    const preset = button.dataset.preset;
    if (preset === "url" || preset === "arabic") button.setAttribute("aria-pressed", "false");
  }
  schedule(150);
});

els.wifiForm.addEventListener("input", () => {
  els.text.value = wifiText();
  schedule(150);
});

els.vcardForm.addEventListener("input", () => {
  els.text.value = vCardText();
  schedule(150);
});

for (const el of [els.mode, els.mask, els.eci, els.margin, els.moduleSize, els.dark, els.light, els.transparent]) {
  el.addEventListener("input", render);
}
for (const radio of Array.from(document.querySelectorAll<HTMLInputElement>('input[name="ec"]'))) {
  radio.addEventListener("change", render);
}
els.minVersion.addEventListener("input", () => schedule(150));
els.minVersion.addEventListener("change", () => {
  els.minVersion.value = String(clampInt(els.minVersion.value, 1, 40, 1));
  render();
});

els.downloadSvg.addEventListener("click", () => {
  if (!current) return;
  save(new Blob([current.svg], { type: "image/svg+xml" }), "qr-code.svg");
  announce("SVG downloaded.");
});

els.downloadPng.addEventListener("click", () => {
  if (!current) return;
  const { qr, options: o } = current;
  const canvas = toCanvas(document.createElement("canvas"), qr, {
    margin: o.margin,
    moduleSize: o.moduleSize,
    dark: o.dark,
    light: o.transparent ? null : o.light,
  });
  canvas.toBlob((blob) => {
    if (blob) {
      save(blob, "qr-code.png");
      announce(`PNG downloaded (${canvas.width} × ${canvas.height} px).`);
    } else {
      announce("Could not create the PNG.");
    }
  }, "image/png");
});

els.copySvg.addEventListener("click", () => {
  if (current) void copyText(current.svg, "SVG markup", els.copySvg);
});

els.copyCode.addEventListener("click", () => {
  void copyText(els.snippet.textContent ?? "", "Code", els.copyCode);
});

setPressed("url");
els.text.value = TEXT_PRESETS.url;
render();
