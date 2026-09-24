/**
 * qr-zero — a zero-dependency QR code encoder.
 *
 * Numeric, alphanumeric and byte modes with automatic segmentation,
 * versions 1–40, error-correction levels L/M/Q/H.
 */
export { encode, QrTooLongError } from "./encode";
export type { EncodeOptions, QrCode } from "./encode";
export { byteCapacity, capacity, dataCodewords, MAX_BYTES } from "./tables";
export type { EcLevel, Mode } from "./tables";
export type { Segment } from "./segment";
export { toDataURL, toSvg } from "./svg";
export type { SvgOptions } from "./svg";
export { toString } from "./text";
export type { TextOptions } from "./text";
