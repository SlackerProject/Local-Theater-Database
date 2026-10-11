import { headers } from "next/headers";

// This site's address as the visitor reached it, e.g. https://example.com
// (for links that leave the site: calendar entries, auth emails)
export async function siteOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
