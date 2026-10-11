"use client";

// Browser-side image handling: every image is resized and compressed on the
// uploader's device before it's stored, so storage and bandwidth stay small.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { derivePalette, extractColors } from "@/lib/palette";
import { MEDIA_BUCKET, type MediaPalette, type UploadedImage } from "@/lib/media";

export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const ACCEPT_ATTR = ACCEPTED_TYPES.join(",");

const MAX_EDGE = 1600; //       long edge of the full image
const THUMB_EDGE = 600; //      long edge of the thumbnail
const TARGET_BYTES = 300_000; // aim for about 300 KB
const MAX_INPUT_BYTES = 30_000_000;

export type ProcessedImage = { full: Blob; thumb: Blob; width: number; height: number };

export function checkFile(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) return `${file.name}: only JPEG, PNG and WebP images can be uploaded.`;
  if (file.size > MAX_INPUT_BYTES) return `${file.name}: this file is too large (over 30 MB).`;
  return null;
}

// Decodes the image, applying the camera's rotation (EXIF) so it's upright
async function decode(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(`${file.name}: this image couldn't be read. Try saving it as a JPEG first.`);
  }
}

function draw(bitmap: ImageBitmap, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#FFFFFF"; // transparent PNG areas become white in the JPEG
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't compress the image."))), "image/jpeg", quality),
  );
}

// Lower the quality, then the size, until the JPEG is near the target
async function compress(bitmap: ImageBitmap) {
  let edge = MAX_EDGE;
  let canvas = draw(bitmap, edge);
  let blob = await toJpeg(canvas, 0.85);
  for (let attempt = 0; blob.size > TARGET_BYTES && attempt < 6; attempt++) {
    for (const q of [0.78, 0.7, 0.62]) {
      blob = await toJpeg(canvas, q);
      if (blob.size <= TARGET_BYTES) break;
    }
    if (blob.size > TARGET_BYTES) {
      edge = Math.round(edge * 0.85);
      canvas = draw(bitmap, edge);
      blob = await toJpeg(canvas, 0.78);
    }
  }
  return { blob, width: canvas.width, height: canvas.height };
}

export async function processImage(file: File): Promise<ProcessedImage & { bitmap: ImageBitmap }> {
  const problem = checkFile(file);
  if (problem) throw new Error(problem);
  const bitmap = await decode(file);
  const full = await compress(bitmap);
  const thumb = await toJpeg(draw(bitmap, THUMB_EDGE), 0.78);
  return { full: full.blob, thumb, width: full.width, height: full.height, bitmap };
}

// The poster's palette (DESIGN.md "Show color system"), from a small copy
export function posterPalette(bitmap: ImageBitmap): MediaPalette {
  const canvas = draw(bitmap, 160);
  const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
  const { ground, accent } = extractColors(pixels);
  const p = derivePalette(ground, accent);
  return { ground: p.ground, ground2: p.ground2, ink: p.ink, soft: p.soft, accent: p.accent };
}

// Stores the full image and thumbnail in the uploader's own folder
export async function uploadProcessed(
  supabase: SupabaseClient<Database>,
  userId: string,
  image: ProcessedImage,
): Promise<UploadedImage> {
  const id = crypto.randomUUID();
  const storage_key = `uploads/${userId}/${id}.jpg`;
  const thumb_key = `uploads/${userId}/${id}-thumb.jpg`;
  const options = { contentType: "image/jpeg", cacheControl: "31536000", upsert: false };
  const bucket = supabase.storage.from(MEDIA_BUCKET);
  const full = await bucket.upload(storage_key, image.full, options);
  if (full.error) throw new Error(`Upload failed: ${full.error.message}`);
  const thumb = await bucket.upload(thumb_key, image.thumb, options);
  if (thumb.error) {
    await bucket.remove([storage_key]);
    throw new Error(`Upload failed: ${thumb.error.message}`);
  }
  return { storage_key, thumb_key, width: image.width, height: image.height, bytes: image.full.size };
}
