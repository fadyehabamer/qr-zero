/**
 * qr-zero/react — a QR code component rendering inline SVG.
 *
 * Kept out of the main entry so that importing `qr-zero` never loads React.
 */
import { createElement, useMemo, type ReactElement, type SVGProps } from "react";
import { encode, toSvgPath, type EcLevel } from "./index";

export interface QrCodeProps
  extends Omit<SVGProps<SVGSVGElement>, "children" | "viewBox" | "width" | "height" | "ref"> {
  /** The text to encode, as UTF-8. */
  value: string;
  /** Error-correction level. Default `"M"`. */
  ecLevel?: EcLevel;
  /** Rendered width and height: a number of pixels or any CSS length. Default 128. */
  size?: number | string;
  /**
   * Accessible name. When set, the SVG gets `role="img"`, an `aria-label` and
   * a `<title>` element; without it, label the surrounding element instead.
   */
  title?: string;
  /** Quiet-zone width in modules. Default 4. */
  margin?: number;
  /** Colour of dark modules; `"currentColor"` follows the text colour. Default `"#000000"`. */
  dark?: string;
  /** Background colour; `null` or `"transparent"` omits it. Default `"#ffffff"`. */
  light?: string | null;
}

/**
 * `<QrCode value="https://example.com" title="Example" />` renders the
 * smallest symbol that fits `value`, as one `<svg>` with a single `<path>`.
 * Encoding is memoised on `value`, `ecLevel` and `margin`. A value too long
 * for a QR code throws `QrTooLongError` during render.
 */
export function QrCode(props: QrCodeProps): ReactElement {
  const {
    value,
    ecLevel = "M",
    size = 128,
    title,
    margin = 4,
    dark = "#000000",
    light = "#ffffff",
    ...rest
  } = props;
  if (!Number.isInteger(margin) || margin < 0) {
    throw new RangeError(`margin must be a non-negative integer, got ${margin}`);
  }

  const { d, dim } = useMemo(() => {
    const qr = encode(value, ecLevel);
    return { d: toSvgPath(qr, margin), dim: qr.size + margin * 2 };
  }, [value, ecLevel, margin]);

  return createElement(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: `0 0 ${dim} ${dim}`,
      width: size,
      height: size,
      shapeRendering: "crispEdges",
      ...(title !== undefined && { role: "img", "aria-label": title }),
      ...rest,
    },
    title !== undefined && createElement("title", null, title),
    light !== null && light !== "transparent" && createElement("rect", { width: dim, height: dim, fill: light }),
    createElement("path", { fill: dark, d }),
  );
}
