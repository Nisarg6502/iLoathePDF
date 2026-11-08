/**
 * Cleanup filters for photographed pages, applied before the images become a
 * PDF. The counterpart of sidecar/ops/scan_to_pdf.py: "enhanced" stretches the
 * contrast, "bw" turns the page into crisp black text on white while ignoring
 * uneven lighting and shadows.
 */

export type ScanMode = "color" | "enhanced" | "bw";

/** Stretch each colour channel so the darkest 1% and brightest 1% span the full range. */
export function enhance(data: Uint8ClampedArray, cutoff = 0.01): void {
  const pixels = data.length / 4;
  for (let channel = 0; channel < 3; channel++) {
    const hist = new Uint32Array(256);
    for (let i = channel; i < data.length; i += 4) hist[data[i]] += 1;
    const limit = pixels * cutoff;
    let low = 0;
    let seen = 0;
    while (low < 255 && seen + hist[low] <= limit) seen += hist[low++];
    let high = 255;
    seen = 0;
    while (high > low && seen + hist[high] <= limit) seen += hist[high--];
    if (high <= low) continue; // a flat channel has nothing to stretch
    const scale = 255 / (high - low);
    for (let i = channel; i < data.length; i += 4) {
      data[i] = Math.max(0, Math.min(255, (data[i] - low) * scale));
    }
  }
}

function otsu(hist: Uint32Array, total: number): number {
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0;
  let weightB = 0;
  let best = 0;
  let threshold = 0;
  for (let t = 0; t < 256; t++) {
    weightB += hist[t];
    if (weightB === 0) continue;
    const weightF = total - weightB;
    if (weightF === 0) break;
    sumB += t * hist[t];
    const between = weightB * weightF * (sumB / weightB - (sum - sumB) / weightF) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

/** Box-blurred copy of a single-channel image, via an integral image (O(pixels) for any radius). */
function boxBlur(gray: Uint8Array, width: number, height: number, radius: number): Float32Array {
  const stride = width + 1;
  const integral = new Float64Array(stride * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      row += gray[y * width + x];
      integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + row;
    }
  }
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height, y + radius + 1);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width, x + radius + 1);
      const sum =
        integral[y1 * stride + x1] - integral[y0 * stride + x1] - integral[y1 * stride + x0] + integral[y0 * stride + x0];
      out[y * width + x] = sum / ((x1 - x0) * (y1 - y0));
    }
  }
  return out;
}

/**
 * Black ink on white paper. Each pixel is compared with the average of its
 * surroundings, so a shadow across the page does not turn it grey or black.
 */
export function toBlackAndWhite(data: Uint8ClampedArray, width: number, height: number): void {
  const gray = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }
  const background = boxBlur(gray, width, height, Math.max(8, Math.round(Math.max(width, height) / 30)));
  const diff = new Uint8Array(width * height);
  const hist = new Uint32Array(256);
  for (let p = 0; p < gray.length; p++) {
    const d = Math.max(0, Math.min(255, Math.round(background[p] - gray[p])));
    diff[p] = d;
    hist[d] += 1;
  }
  // Ink is whatever sits clearly darker than its surroundings.
  const threshold = Math.max(12, Math.min(60, otsu(hist, gray.length)));
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const value = diff[p] > threshold ? 0 : 255;
    data[i] = data[i + 1] = data[i + 2] = value;
    data[i + 3] = 255;
  }
}

export async function filterImage(file: File, mode: ScanMode): Promise<File> {
  if (mode === "color") return file;
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D context unavailable.");
  // JPEGs have no alpha; anything else is flattened onto white so transparency does not turn black.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  if (mode === "enhanced") enhance(image.data);
  else toBlackAndWhite(image.data, canvas.width, canvas.height);
  ctx.putImageData(image, 0, 0);

  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Canvas export failed."))), mode === "bw" ? "image/png" : "image/jpeg", 0.92),
  );
  const ext = mode === "bw" ? "png" : "jpg";
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + "." + ext, { type: blob.type });
}
