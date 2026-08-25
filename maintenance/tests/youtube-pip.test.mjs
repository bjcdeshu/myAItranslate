import assert from 'node:assert/strict';
import test from 'node:test';

await import(`../../youtube-pip.js?test=${Date.now()}`);
const api = globalThis.__MYAIT_YOUTUBE_PIP_TEST__;

assert.ok(api, 'youtube-pip.js must expose its pure helpers under Node.js');

const {
  cleanText,
  uniqueTexts,
  normalizeSubtitleState,
  mergeSubtitleCandidates,
  computePipDimensions,
  clampSeekTime,
} = api;

test('cleans subtitle text without flattening intentional line breaks', () => {
  assert.equal(cleanText('  Hello   world  \n  你好  '), 'Hello world\n你好');
  assert.equal(cleanText('\u200B  '), '');
});

test('deduplicates visible cue fragments while preserving order', () => {
  assert.deepEqual(uniqueTexts(['One', ' One ', '', 'Two', 'One']), ['One', 'Two']);
});

test('normalizes renderer event aliases and removes duplicate translation', () => {
  assert.deepEqual(
    normalizeSubtitleState({ source: 'Hello', translation: '你好', startTime: 1, endTime: 2 }),
    { original: 'Hello', translated: '你好', start: 1, end: 2 },
  );
  assert.deepEqual(normalizeSubtitleState({ text: 'Same', target: 'Same' }), {
    original: 'Same',
    translated: '',
    start: null,
    end: null,
  });
});

test('prefers Immersive Translate source and target cues over YouTube fallback', () => {
  assert.deepEqual(
    mergeSubtitleCandidates(['Original'], ['翻译'], ['YouTube original']),
    { original: 'Original', translated: '翻译', start: null, end: null },
  );
  assert.deepEqual(mergeSubtitleCandidates([], [], ['Fallback']), {
    original: 'Fallback',
    translated: '',
    start: null,
    end: null,
  });
});

test('calculates bounded Picture-in-Picture dimensions', () => {
  assert.deepEqual(computePipDimensions(1920, 1080, 560), { width: 560, height: 315 });
  assert.deepEqual(computePipDimensions(0, 0, 100), { width: 320, height: 240 });
  assert.deepEqual(computePipDimensions(1080, 1920, 900), { width: 720, height: 720 });
});

test('clamps keyboard and control seeking', () => {
  assert.equal(clampSeekTime(5, -10, 100), 0);
  assert.equal(clampSeekTime(95, 10, 100), 100);
  assert.equal(clampSeekTime(10, 5, Number.POSITIVE_INFINITY), 15);
});
