import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

// Pages here read their data per request (cacheComponents), so the only
// cached pages are the static shells made at build time; those ship with
// the site's files. An R2 bucket can replace this if pages start caching data.
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
});
