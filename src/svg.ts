import type { QrCode } from "./encode";

export interface SvgOptions {
  /** Quiet-zone width in modules. The spec asks for 4. Default 4. */
  margin?: number;
  /** Colour of dark modules. Default `"#000000"`. */
  dark?: string;
  /**
   * Background colour, painted under the whole symbol including the quiet
   * zone. `null` or `"transparent"` omits the background. Default `"#ffffff"`.
   */
  light?: string | null;
  /** Pixels per module for the `width`/`height` attributes. Default 4. */
  moduleSize?: number;
  /**
   * Accessible name. When set, the SVG gets `role="img"`, an `aria-label` and
   * a `<title>` element. Without it the SVG carries no accessibility
   * attributes, so give the surrounding element (e.g. `<img alt>`) a label.
   */
  title?: string;
}

const escapeXml = (s: string) =>
  s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&apos;",
  );


/**
 * Render a QR code as a standalone SVG string. Dark modules are merged into
 * one `<path>` of horizontal runs, drawn in module units inside a `viewBox`,
 * so the image scales cleanly to any size.
 */
export function toSvg(qr: QrCode, options: SvgOptions = {}): string {
  const { margin = 4, dark = "#000000", light = "#ffffff", moduleSize = 4, title } = options;
  if (!Number.isInteger(margin) || margin < 0) {
    throw new RangeError(`margin must be a non-negative integer, got ${margin}`);
  }
  if (!Number.isFinite(moduleSize) || moduleSize <= 0) {
    throw new RangeError(`moduleSize must be a positive number, got ${moduleSize}`);
  }

  const dim = qr.size + margin * 2;
  const px = dim * moduleSize;

  let d = "";
  for (let y = 0; y < qr.size; y++) {
    const row = qr.modules[y];
    for (let x = 0; x < qr.size; ) {
      if (!row[x]) {
        x++;
        continue;
      }
      let run = 1;
      while (x + run < qr.size && row[x + run]) run++;
      d += `M${x + margin} ${y + margin}h${run}v1h-${run}z`;
      x += run;
    }
  }

  const a11y =
    title !== undefined ? ` role="img" aria-label="${escapeXml(title)}"` : "";
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" width="${px}" height="${px}" shape-rendering="crispEdges"${a11y}>`,
  ];
  if (title !== undefined) parts.push(`<title>${escapeXml(title)}</title>`);
  if (light !== null && light !== "transparent") {
    parts.push(`<rect width="${dim}" height="${dim}" fill="${escapeXml(light)}"/>`);
  }
  parts.push(`<path fill="${escapeXml(dark)}" d="${d}"/>`, `</svg>`);
  return parts.join("");
}

/**
 * Render a QR code as an SVG `data:` URI, ready for `<img src>` or CSS
 * `url()`. The SVG is percent-encoded, so it is safe with any title text.
 */
export function toDataURL(qr: QrCode, options: SvgOptions = {}): string {
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(toSvg(qr, options));
}
