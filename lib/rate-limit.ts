import { headers } from "next/headers";

type Limiter = { limit(options: { key: string }): Promise<{ success: boolean }> };

// Sign-in and sign-up attempts from one visitor's address, counted by
// Cloudflare's rate limiter (wrangler.jsonc "AUTH_LIMITER"). Off the
// Cloudflare runtime (local development) everything is allowed.
export async function allowAuthAttempt(): Promise<boolean> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const limiter = (getCloudflareContext().env as { AUTH_LIMITER?: Limiter }).AUTH_LIMITER;
    if (!limiter) return true;
    const ip = (await headers()).get("cf-connecting-ip") ?? "unknown";
    return (await limiter.limit({ key: `auth:${ip}` })).success;
  } catch {
    return true;
  }
}
