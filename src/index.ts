/**
 * qr-zero — a zero-dependency QR code encoder.
 *
 * Byte mode, versions 1–40, error-correction levels L/M/Q/H.
 */
export { encode, QrTooLongError } from "./encode";
export type { EncodeOptions, QrCode } from "./encode";
export { byteCapacity, dataCodewords, MAX_BYTES } from "./tables";
export type { EcLevel } from "./tables";
export { toDataURL, toSvg } from "./svg";
export type { SvgOptions } from "./svg";
export { toString } from "./text";
export type { TextOptions } from "./text";
