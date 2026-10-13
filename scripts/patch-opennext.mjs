// Temporary fix for @opennextjs/cloudflare on Next.js 16.4: the adapter
// bundles the server's manifest files into the worker by name, and misses
// .next/server/preview-props.json (new in Next.js 16.4), so every page
// fails with "Unexpected loadManifest(.../preview-props.json) call!".
// This adds the file to the list, the same change as the adapter's
// pending fix (opennextjs/opennextjs-cloudflare PR #1356). Once a release
// includes it this finds nothing to change, and the script can be removed.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const pkgDir = join(process.cwd(), "node_modules/@opennextjs/cloudflare");
const file = join(pkgDir, "dist/cli/build/patches/plugins/load-manifest.js");
const before = "{*-manifest,required-server-files,prefetch-hints}.json";
const after = "{*-manifest,required-server-files,prefetch-hints,preview-props}.json";

const source = readFileSync(file, "utf8");
if (source.includes(after)) {
  console.log("patch-opennext: already includes preview-props.json");
} else if (source.includes(before)) {
  writeFileSync(file, source.replace(before, after));
  console.log("patch-opennext: added preview-props.json to the bundled manifests");
} else {
  console.log("patch-opennext: adapter code changed; check whether this fix is still needed");
}
