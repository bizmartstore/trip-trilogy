/**
 * Compress an image file into a compact data-URL string.
 * Renders as a normal <img> everywhere, but stores as text (no blob storage quota).
 */
export async function imageFileToText(
  file: File,
  opts: { maxWidth?: number; quality?: number } = {},
): Promise<string> {
  const maxWidth = opts.maxWidth ?? 960;
  const quality = opts.quality ?? 0.7;

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process image");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const mime = file.type.includes("png") ? "image/png" : "image/jpeg";
  const dataUrl = canvas.toDataURL(mime, quality);

  // Cap size — further compress if needed
  if (dataUrl.length > 280_000 && mime === "image/jpeg") {
    return canvas.toDataURL("image/jpeg", 0.45);
  }
  if (dataUrl.length > 350_000) {
    const smaller = document.createElement("canvas");
    smaller.width = Math.round(width * 0.65);
    smaller.height = Math.round(height * 0.65);
    const sctx = smaller.getContext("2d");
    if (!sctx) return dataUrl;
    sctx.drawImage(canvas, 0, 0, smaller.width, smaller.height);
    return smaller.toDataURL("image/jpeg", 0.5);
  }
  return dataUrl;
}

export async function filesToImageText(files: FileList | File[]): Promise<string[]> {
  const list = Array.from(files).slice(0, 6);
  const out: string[] = [];
  for (const file of list) {
    if (!file.type.startsWith("image/")) continue;
    out.push(await imageFileToText(file));
  }
  return out;
}
