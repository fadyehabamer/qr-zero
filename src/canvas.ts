import type { QrCode } from "./encode";

/** The part of a 2D rendering context that `toCanvas` draws with. */
export interface CanvasContext2D {
  fillStyle: unknown;
  fillRect(x: number, y: number, width: number, height: number): void;
  clearRect(x: number, y: number, width: number, height: number): void;
}

/**
 * Anything with a 2D context: an `HTMLCanvasElement`, an `OffscreenCanvas`
 * or a server-side canvas. Typed structurally so that importing qr-zero
 * needs neither the DOM nor its type definitions.
 */
export interface CanvasLike {
  width: number;
  height: number;
  getContext(contextId: "2d"): CanvasContext2D | null;
}

export interface CanvasOptions {
  /** Quiet-zone width in modules. Default 4. */
  margin?: number;
  /** Canvas pixels per module; a whole number keeps edges crisp. Default 4. */
  moduleSize?: number;
  /** Colour of dark modules. Default `"#000000"`. */
  dark?: string;
  /**
   * Background colour, painted under the whole symbol including the quiet
   * zone. `null` or `"transparent"` leaves it clear. Default `"#ffffff"`.
   */
  light?: string | null;
}

/**
 * Draw a QR code onto a canvas, resizing the canvas to fit it exactly
 * (`(size + 2 * margin) * moduleSize` pixels square). Returns the canvas.
 * For sharp output on high-density screens, multiply `moduleSize` by
 * `devicePixelRatio` and scale the canvas back down with CSS.
 */
export function toCanvas<C extends CanvasLike>(canvas: C, qr: QrCode, options: CanvasOptions = {}): C {
  const { margin = 4, moduleSize = 4, dark = "#000000", light = "#ffffff" } = options;
  if (!Number.isInteger(margin) || margin < 0) {
    throw new RangeError(`margin must be a non-negative integer, got ${margin}`);
  }
  if (!Number.isInteger(moduleSize) || moduleSize <= 0) {
    throw new RangeError(`moduleSize must be a positive integer, got ${moduleSize}`);
  }

  const px = (qr.size + margin * 2) * moduleSize;
  canvas.width = canvas.height = px; // resizing also resets the context state
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new TypeError("toCanvas() could not get a 2D context from the canvas");

  if (light === null || light === "transparent") {
    ctx.clearRect(0, 0, px, px);
  } else {
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, px, px);
  }
  ctx.fillStyle = dark;
  for (let y = 0; y < qr.size; y++) {
    const row = qr.modules[y];
    for (let x = 0; x < qr.size; ) {
      if (!row[x]) {
        x++;
        continue;
      }
      let run = 1;
      while (x + run < qr.size && row[x + run]) run++;
      ctx.fillRect((x + margin) * moduleSize, (y + margin) * moduleSize, run * moduleSize, moduleSize);
      x += run;
    }
  }
  return canvas;
}
