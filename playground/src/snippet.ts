import type { EcLevel, EncodeOptions, Mode, SvgOptions } from "qr-zero";

export interface PlaygroundOptions {
  text: string;
  ecLevel: EcLevel;
  mode: Mode | "auto";
  eci: boolean;
  minVersion: number;
  mask: number | null;
  margin: number;
  moduleSize: number;
  dark: string;
  light: string;
  transparent: boolean;
}

export const DEFAULTS: PlaygroundOptions = {
  text: "",
  ecLevel: "M",
  mode: "auto",
  eci: false,
  minVersion: 1,
  mask: null,
  margin: 4,
  moduleSize: 4,
  dark: "#000000",
  light: "#ffffff",
  transparent: false,
};

export function encodeOptions(o: PlaygroundOptions): EncodeOptions {
  const out: EncodeOptions = {};
  if (o.ecLevel !== DEFAULTS.ecLevel) out.ecLevel = o.ecLevel;
  if (o.mode !== DEFAULTS.mode) out.mode = o.mode;
  if (o.eci) out.eci = true;
  if (o.minVersion !== DEFAULTS.minVersion) out.minVersion = o.minVersion;
  if (o.mask !== null) out.mask = o.mask;
  return out;
}

export function svgOptions(o: PlaygroundOptions): SvgOptions {
  const out: SvgOptions = {};
  if (o.margin !== DEFAULTS.margin) out.margin = o.margin;
  if (o.moduleSize !== DEFAULTS.moduleSize) out.moduleSize = o.moduleSize;
  if (o.dark.toLowerCase() !== DEFAULTS.dark) out.dark = o.dark;
  if (o.transparent) out.light = null;
  else if (o.light.toLowerCase() !== DEFAULTS.light) out.light = o.light;
  return out;
}

const objectArg = (options: object): string => {
  const fields = Object.entries(options).map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  return fields.length ? `, { ${fields.join(", ")} }` : "";
};

export function snippet(o: PlaygroundOptions): string {
  return [
    `import { encode, toSvg } from "qr-zero";`,
    "",
    `const qr = encode(${JSON.stringify(o.text)}${objectArg(encodeOptions(o))});`,
    `const svg = toSvg(qr${objectArg(svgOptions(o))});`,
    "",
  ].join("\n");
}
