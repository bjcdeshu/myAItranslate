import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { resolveProviderEndpoint } from "../reference/provider-endpoint.mjs";
import { resolveTextLengthLimits } from "../reference/subtitle-batching.mjs";
import {
  alignSubtitleTranslation,
  normalizeYoutubeEvents,
} from "../reference/youtube-timeline.mjs";

const openAiEndpoint = "https://api.openai.com/v1/chat/completions";
const anthropicEndpoint = "https://api.anthropic.com/v1/messages";

test("P0-1 completes OpenAI-compatible base URLs without touching explicit endpoints", () => {
  assert.equal(
    resolveProviderEndpoint(openAiEndpoint, "https://proxy.example.com"),
    "https://proxy.example.com/v1/chat/completions",
  );
  assert.equal(
    resolveProviderEndpoint(openAiEndpoint, "proxy.example.com/v1"),
    "https://proxy.example.com/v1/chat/completions",
  );
  assert.equal(
    resolveProviderEndpoint(openAiEndpoint, "https://proxy.example.com/openai/v1"),
    "https://proxy.example.com/openai/v1/chat/completions",
  );
  assert.equal(
    resolveProviderEndpoint(
      openAiEndpoint,
      "http://127.0.0.1:8080/v1?token=test#debug",
    ),
    "http://127.0.0.1:8080/v1/chat/completions?token=test#debug",
  );
  assert.equal(
    resolveProviderEndpoint(
      openAiEndpoint,
      "https://proxy.example.com/custom/endpoint",
    ),
    "https://proxy.example.com/custom/endpoint",
  );
  assert.equal(
    resolveProviderEndpoint(
      openAiEndpoint,
      "https://proxy.example.com/v1/chat/completions",
    ),
    "https://proxy.example.com/v1/chat/completions",
  );
});

test("P0-1 completes Anthropic base URLs", () => {
  assert.equal(
    resolveProviderEndpoint(anthropicEndpoint, "https://proxy.example.com/v1"),
    "https://proxy.example.com/v1/messages",
  );
  assert.equal(
    resolveProviderEndpoint(
      anthropicEndpoint,
      "https://proxy.example.com/anthropic/v1",
    ),
    "https://proxy.example.com/anthropic/v1/messages",
  );
  assert.equal(
    resolveProviderEndpoint(
      anthropicEndpoint,
      "https://proxy.example.com/v1/messages",
    ),
    "https://proxy.example.com/v1/messages",
  );
});

test("P0-2 applies subtitle-specific batching to every subtitle scene", () => {
  const base = {
    maxTextLength: 1200,
    maxTextGroupLength: 1,
    serviceConfig: {
      maxTextLengthPerRequest: 2400,
      maxTextGroupLengthPerRequest: 20,
      maxTextGroupLengthPerRequestForSubtitle: "5.9",
    },
  };

  for (const usageScene of [
    "subtitle",
    "subtitle_video",
    "subtitle_file",
    "subtitle_ai",
  ]) {
    assert.deepEqual(resolveTextLengthLimits({ ...base, usageScene }), {
      maxTextLength: 2400,
      maxTextGroupLength: 5,
    });
  }

  assert.deepEqual(
    resolveTextLengthLimits({ ...base, usageScene: "web_page" }),
    { maxTextLength: 2400, maxTextGroupLength: 20 },
  );
});

test("P0-2 falls back safely for invalid group sizes", () => {
  assert.deepEqual(
    resolveTextLengthLimits({
      maxTextLength: 1200,
      maxTextGroupLength: 3,
      usageScene: "subtitle_video",
      serviceConfig: {
        maxTextGroupLengthPerRequest: -10,
        maxTextGroupLengthPerRequestForSubtitle: "0",
      },
    }),
    { maxTextLength: 1200, maxTextGroupLength: 3 },
  );
});

test("P0-3 preserves append and zero-duration YouTube cues and repairs the timeline", async () => {
  const fixture = JSON.parse(
    await readFile(
      new URL("../fixtures/youtube-json3/abnormal-events.json", import.meta.url),
      "utf8",
    ),
  );
  const normalized = normalizeYoutubeEvents(fixture);

  assert.equal(normalized.length, 3);
  assert.equal(normalized[0].text, "Hello world");
  assert.equal(normalized[0].tStartMs, 0);
  assert.equal(normalized[0].dDurationMs, 1000);
  assert.equal(normalized[1].text, "Second cue");
  assert.equal(normalized[1].dDurationMs, 1000);
  assert.equal(normalized[2].text, "Third cue");
  assert.equal(normalized[2].dDurationMs, 100);
  assert.ok(normalized.every((cue) => cue.dDurationMs > 0));
});

test("P0-3 caps pathological duration and aligns translation by timestamp", () => {
  const source = normalizeYoutubeEvents([
    { tStartMs: 0, dDurationMs: 999999, segs: [{ utf8: "A" }] },
    { tStartMs: 40000, dDurationMs: 1000, segs: [{ utf8: "B" }] },
  ]);
  assert.equal(source[0].dDurationMs, 30000);

  const translations = normalizeYoutubeEvents([
    { tStartMs: 250, dDurationMs: 1000, segs: [{ utf8: "甲" }] },
    { tStartMs: 40600, dDurationMs: 1000, segs: [{ utf8: "乙" }] },
  ]);
  assert.deepEqual(alignSubtitleTranslation(source, translations), ["甲", "乙"]);
});

test("generated bundles contain exactly the expected P0 markers", async () => {
  const bundles = {
    "content_main.js": {
      provider: 1,
      batching: 1,
      youtube: 1,
    },
    "options.js": {
      provider: 1,
      batching: 1,
      youtube: 0,
    },
    "popup.js": {
      provider: 1,
      batching: 1,
      youtube: 0,
    },
    "side-panel.js": {
      provider: 1,
      batching: 1,
      youtube: 0,
    },
  };

  for (const [file, expected] of Object.entries(bundles)) {
    const source = await readFile(new URL(`../../${file}`, import.meta.url), "utf8");
    const count = (marker) => source.split(marker).length - 1;

    assert.equal(count("myAItranslate:p0-provider-endpoint"), expected.provider, file);
    assert.equal(count("myAItranslate:p0-subtitle-batching"), expected.batching, file);
    assert.equal(count("myAItranslate:p0-youtube-timeline"), expected.youtube, file);
  }
});

test("maintenance manifest identifies the current release without runtime wrappers", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("../../manifest.json", import.meta.url), "utf8"),
  );

  assert.equal(manifest.version, "1.29.1.2");
  assert.equal(manifest.version_name, "1.29.1-maint.2");
  assert.equal(manifest.background.service_worker, "background.js");
  assert.ok(
    manifest.content_scripts.every((entry) =>
      entry.js.every((file) => !file.startsWith("maintenance/")),
    ),
  );
});
