import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(
  new URL("../runtime/content-prelude.js", import.meta.url),
  "utf8"
);

function loadNormalizer() {
  const sandbox = { console };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: "content-prelude.js" });
  return sandbox.__myAITranslateNormalizeYoutubeTimedText;
}

const normalize = loadNormalizer();

function assertValidTimeline(events) {
  assert.ok(events.length > 0);
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    assert.ok(Number.isFinite(event.tStartMs));
    assert.ok(Number.isFinite(event.dDurationMs));
    assert.ok(event.tStartMs >= 0);
    assert.ok(event.dDurationMs > 0);
    assert.equal(event.aAppend, 0);
    assert.ok(event.segs?.[0]?.utf8);

    if (index + 1 < events.length) {
      const end = event.tStartMs + event.dDurationMs;
      assert.ok(end <= events[index + 1].tStartMs);
    }
  }
}

test("healthy manual-caption timelines are left untouched", () => {
  const payload = {
    events: [
      { tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: "Hello" }] },
      { tStartMs: 1000, dDurationMs: 1200, segs: [{ utf8: "World" }] },
    ],
  };

  assert.equal(normalize(payload), payload);
});

test("missing and zero durations are inferred from following cues", () => {
  const result = normalize({
    events: [
      { tStartMs: 0, dDurationMs: 0, segs: [{ utf8: "First" }] },
      { tStartMs: 1500, segs: [{ utf8: "Second" }] },
      { tStartMs: 3000, dDurationMs: 900, segs: [{ utf8: "Third" }] },
    ],
  });

  assertValidTimeline(result.events);
  assert.equal(result.events[0].dDurationMs, 1500);
  assert.equal(result.events[1].dDurationMs, 1500);
});

test("scrolling ASR append events are converted into ordinary cues", () => {
  const result = normalize({
    events: [
      { tStartMs: 0, dDurationMs: 0, segs: [{ utf8: "We are" }] },
      { tStartMs: 500, dDurationMs: 0, aAppend: 1, segs: [{ utf8: " building" }] },
      { tStartMs: 1400, dDurationMs: 0, aAppend: 1, segs: [{ utf8: "\n" }] },
      { tStartMs: 1800, dDurationMs: 1000, segs: [{ utf8: "the future" }] },
    ],
  });

  assertValidTimeline(result.events);
  assert.equal(result.events.length, 2);
  assert.equal(result.events[0].segs[0].utf8, "We are building");
});

test("cumulative and duplicate ASR windows do not create repeated cues", () => {
  const result = normalize({
    events: [
      { tStartMs: 0, dDurationMs: 0, segs: [{ utf8: "one of" }] },
      { tStartMs: 350, dDurationMs: 0, segs: [{ utf8: "one of the things" }] },
      { tStartMs: 350, dDurationMs: 0, segs: [{ utf8: "one of the things" }] },
      { tStartMs: 2100, dDurationMs: 800, segs: [{ utf8: "next cue" }] },
    ],
  });

  assertValidTimeline(result.events);
  assert.equal(result.events.length, 2);
  assert.equal(result.events[0].segs[0].utf8, "one of the things");
});

test("absurdly long durations are clamped and overlaps removed", () => {
  const result = normalize({
    events: [
      { tStartMs: 0, dDurationMs: 120000, segs: [{ utf8: "Long cue" }] },
      { tStartMs: 4000, dDurationMs: 1000, segs: [{ utf8: "Next cue" }] },
    ],
  });

  assertValidTimeline(result.events);
  assert.equal(result.events[0].dDurationMs, 4000);
});
