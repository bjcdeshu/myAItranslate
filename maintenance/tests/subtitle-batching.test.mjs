import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const [contentMain, optionsBundle, defaultConfig] = await Promise.all([
  readFile(new URL("content_main.js", root), "utf8"),
  readFile(new URL("options.js", root), "utf8"),
  readFile(new URL("default_config.json", root), "utf8"),
]);

const field = "maxTextGroupLengthPerRequestForSubtitle";

function nearby(source, first, second, radius = 50000) {
  let index = source.indexOf(first);
  while (index !== -1) {
    const start = Math.max(0, index - radius);
    const end = Math.min(source.length, index + first.length + radius);
    if (source.slice(start, end).includes(second)) return true;
    index = source.indexOf(first, index + first.length);
  }
  return false;
}

test("subtitle batch-size setting exists in runtime, settings UI and defaults", () => {
  assert.ok(contentMain.includes(field), `${field} is missing from content_main.js`);
  assert.ok(optionsBundle.includes(field), `${field} is missing from options.js`);
  assert.ok(defaultConfig.includes(field), `${field} is missing from default_config.json`);
});

test("runtime selection connects subtitle usageScene to the subtitle-specific limit", () => {
  assert.ok(contentMain.includes("usageScene"), "usageScene routing is missing");
  assert.ok(contentMain.includes("subtitle"), "subtitle usage scene is missing");
  assert.ok(
    nearby(contentMain, field, "usageScene") && nearby(contentMain, field, "subtitle"),
    "subtitle-specific group limit is no longer connected to usage-scene routing"
  );
});

test("at least one subtitle translation entry point declares the subtitle usage scene", () => {
  const directScene = /usageScene\s*:\s*["']subtitle["']/g.test(contentMain);
  const minifiedScene = /["']subtitle["']\s*[,}]|usageScene.{0,200}["']subtitle["']/s.test(
    contentMain
  );
  assert.ok(directScene || minifiedScene, "no subtitle translation entry point was detected");
});
