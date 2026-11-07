import { describe, it, expect } from "vitest";
import { readJpegOrientation } from "./jpegOrientation";

/** SOI + an APP1/Exif segment carrying one Orientation entry + EOI. */
function jpegWithOrientation(value: number, littleEndian: boolean): Uint8Array {
  const u16 = (n: number) => (littleEndian ? [n & 0xff, n >> 8] : [n >> 8, n & 0xff]);
  const u32 = (n: number) =>
    littleEndian ? [n & 0xff, (n >> 8) & 0xff, 0, 0] : [0, 0, (n >> 8) & 0xff, n & 0xff];
  const tiff = [
    ...(littleEndian ? [0x49, 0x49] : [0x4d, 0x4d]),
    ...u16(42),
    ...u32(8), // IFD0 right after the header
    ...u16(1), // one entry
    ...u16(0x0112), // Orientation
    ...u16(3), // type SHORT
    ...u32(1), // count
    ...u16(value),
    0,
    0, // value padding
    ...u32(0), // no next IFD
  ];
  const exif = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const length = exif.length + 2;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, length >> 8, length & 0xff, ...exif, 0xff, 0xd9]);
}

describe("readJpegOrientation", () => {
  it.each([1, 3, 6, 8])("reads orientation %i (little endian)", (value) => {
    expect(readJpegOrientation(jpegWithOrientation(value, true))).toBe(value);
  });

  it.each([1, 3, 6, 8])("reads orientation %i (big endian)", (value) => {
    expect(readJpegOrientation(jpegWithOrientation(value, false))).toBe(value);
  });

  it("returns 1 for a JPEG with no EXIF", () => {
    expect(readJpegOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2, 0xff, 0xd9]))).toBe(1);
  });

  it("returns 1 for data that is not a JPEG or is truncated", () => {
    expect(readJpegOrientation(new Uint8Array([1, 2, 3]))).toBe(1);
    expect(readJpegOrientation(jpegWithOrientation(6, true).slice(0, 20))).toBe(1);
    expect(readJpegOrientation(new Uint8Array())).toBe(1);
  });

  it("ignores an out-of-range orientation value", () => {
    expect(readJpegOrientation(jpegWithOrientation(9, true))).toBe(1);
  });
});
