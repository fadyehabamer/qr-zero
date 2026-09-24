import type { QrCode } from "./encode";

export interface TextOptions {
  /** Quiet-zone width in modules. Default 2. */
  margin?: number;
  /**
   * `"blocks"` (default) packs two module rows per line with Unicode half
   * blocks (▀ ▄ █). `"ascii"` uses two characters per module (`##` / spaces)
   * and one line per row.
   */
  style?: "blocks" | "ascii";
  /**
   * Swap dark and light. Terminals with light text on a dark background
   * need this to show a scannable (dark-on-light) code. Default `false`.
   */
  invert?: boolean;
}

const HALF_BLOCKS = [" ", "▄", "▀", "█"]; // index: (top << 1) | bottom

/** Render a QR code as text for terminals, logs or plain-text contexts. */
export function toString(qr: QrCode, options: TextOptions = {}): string {
  const { margin = 2, style = "blocks", invert = false } = options;
  if (!Number.isInteger(margin) || margin < 0) {
    throw new RangeError(`margin must be a non-negative integer, got ${margin}`);
  }
  const dim = qr.size + margin * 2;
  const filled = (x: number, y: number) => {
    const mx = x - margin;
    const my = y - margin;
    const dark = mx >= 0 && my >= 0 && mx < qr.size && my < qr.size && qr.modules[my][mx];
    return dark !== invert;
  };

  const lines: string[] = [];
  if (style === "ascii") {
    for (let y = 0; y < dim; y++) {
      let line = "";
      for (let x = 0; x < dim; x++) line += filled(x, y) ? "##" : "  ";
      lines.push(line);
    }
  } else {
    for (let y = 0; y < dim; y += 2) {
      let line = "";
      for (let x = 0; x < dim; x++) {
        const top = filled(x, y) ? 1 : 0;
        const bottom = y + 1 < dim && filled(x, y + 1) ? 1 : 0;
        line += HALF_BLOCKS[(top << 1) | bottom];
      }
      lines.push(line);
    }
  }
  return lines.join("\n");
}
