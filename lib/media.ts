// Shared by server and browser: where uploaded images live, and their shapes.

export const MEDIA_BUCKET = "media";
export const PHOTO_LIMIT = 40; // per production, enforced by the database too

// Exact wording required on every upload (Milestone 3)
export const RIGHTS_TEXT =
  "I took these photos or have permission to share them. No one pictured is under 18.";

// Public address of a stored file (the bucket is public; names are random ids)
export function mediaUrl(key: string | null | undefined) {
  if (!key) return null;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${MEDIA_BUCKET}/${key}`;
}

export type MediaPalette = { ground: string; ground2: string; ink: string; soft: string; accent: string };

// A processed, uploaded image, before it has a media row
export type UploadedImage = {
  storage_key: string;
  thumb_key: string;
  width: number;
  height: number;
  bytes: number;
};
