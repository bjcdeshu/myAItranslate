import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";

const manifestPath = new URL("../manifest.json", import.meta.url);
const originalBackgroundPath = new URL("../background.js", import.meta.url);
const backgroundWrapper = "maintenance/runtime/background-wrapper.js";
const contentPrelude = "maintenance/runtime/content-prelude.js";

await access(originalBackgroundPath);

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
assert.equal(manifest.manifest_version, 3, "P0 activation currently targets Manifest V3");
assert.ok(manifest.background, "manifest.background is missing");

manifest.background.service_worker = backgroundWrapper;

const contentScripts = Array.isArray(manifest.content_scripts)
  ? manifest.content_scripts
  : [];
const primaryContentScript = contentScripts.find(
  (entry) => Array.isArray(entry?.js) && entry.js.includes("content_guard.js")
);
assert.ok(primaryContentScript, "content_guard.js content-script entry was not found");

primaryContentScript.js = [
  contentPrelude,
  ...primaryContentScript.js.filter((script) => script !== contentPrelude),
];

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log("Activated P0 runtime shims in manifest.json");
