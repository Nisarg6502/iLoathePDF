/**
 * Reads the EXIF Orientation tag from a JPEG (1 when absent or unreadable).
 *
 * pdf-lib embeds a JPEG's bytes verbatim and ignores EXIF, so a phone photo
 * taken in portrait would land in the PDF on its side. Anything other than 1
 * has to go through the browser's decoder (which honours the tag) instead.
 */
export function readJpegOrientation(bytes: Uint8Array): number {
  const at = (o: number) => bytes[o] ?? 0;
  if (at(0) !== 0xff || at(1) !== 0xd8) return 1;

  let i = 2;
  while (i + 4 <= bytes.length) {
    if (at(i) !== 0xff) return 1;
    const marker = at(i + 1);
    if (marker === 0xff) {
      i += 1; // fill byte
      continue;
    }
    // Markers with no payload.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      i += 2;
      continue;
    }
    if (marker === 0xda || marker === 0xd9) return 1; // start of scan / end: no EXIF past here
    const length = (at(i + 2) << 8) | at(i + 3);

    const isExif =
      marker === 0xe1 &&
      length >= 8 &&
      at(i + 4) === 0x45 && // E
      at(i + 5) === 0x78 && // x
      at(i + 6) === 0x69 && // i
      at(i + 7) === 0x66 && // f
      at(i + 8) === 0 &&
      at(i + 9) === 0;
    if (isExif) return readTiffOrientation(bytes, i + 10);

    i += 2 + length;
  }
  return 1;
}

function readTiffOrientation(bytes: Uint8Array, tiff: number): number {
  const at = (o: number) => bytes[o] ?? 0;
  const little = at(tiff) === 0x49 && at(tiff + 1) === 0x49; // "II"
  const big = at(tiff) === 0x4d && at(tiff + 1) === 0x4d; // "MM"
  if (!little && !big) return 1;

  const u16 = (o: number) => (little ? at(o) | (at(o + 1) << 8) : (at(o) << 8) | at(o + 1));
  const u32 = (o: number) =>
    little
      ? (at(o) | (at(o + 1) << 8) | (at(o + 2) << 16) | (at(o + 3) << 24)) >>> 0
      : ((at(o) << 24) | (at(o + 1) << 16) | (at(o + 2) << 8) | at(o + 3)) >>> 0;

  const ifd = tiff + u32(tiff + 4);
  if (ifd + 2 > bytes.length) return 1;
  const entries = u16(ifd);
  for (let k = 0; k < entries; k++) {
    const entry = ifd + 2 + k * 12;
    if (entry + 12 > bytes.length) return 1;
    if (u16(entry) === 0x0112) {
      const value = u16(entry + 8);
      return value >= 1 && value <= 8 ? value : 1;
    }
  }
  return 1;
}
