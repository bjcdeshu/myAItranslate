# P0 selective backports

This directory contains maintainable compatibility layers around the compiled Immersive Translate 1.29.1 baseline. The original bundles remain intact unless a later change explicitly requires a bundle patch.

## Included P0 work

### 1. Custom provider endpoint normalization

Reference behavior: official 1.30.2.

`runtime/background-wrapper.js` runs before the original `background.js` bundle and installs `provider-fetch-shim.js`. The shim only rewrites POST requests that look like OpenAI- or Anthropic-style chat payloads and whose URL is clearly a Base URL:

- host root -> `/v1/chat/completions` or `/v1/messages`
- a path ending in `/v1` -> `/chat/completions` or `/messages`
- an explicit endpoint -> unchanged

Stored user configuration is not mutated. Any detection or parsing failure falls through to the original request unchanged.

### 2. Provider-specific subtitle batching

Reference behavior: official 1.29.9.

The maintained 1.29.1 bundle already contains `maxTextGroupLengthPerRequestForSubtitle` and routes subtitle translation through `usageScene: "subtitle"`. No duplicate runtime implementation is added. `tests/subtitle-batching.test.mjs` locks this existing behavior across the runtime bundle, settings UI and default configuration.

### 3. YouTube abnormal timeline normalization

Reference behavior: official 1.32.1.

`runtime/content-prelude.js` runs before `content_guard.js`. It narrowly detects YouTube JSON3 timedtext payloads with abnormal timelines and converts them into ordinary, positive-duration, non-overlapping cues before the baseline parser receives them.

Handled cases include:

- missing or zero `dDurationMs`
- out-of-order events
- scrolling-ASR `aAppend` events
- cumulative and adjacent duplicate windows
- excessive duration and overlapping cues

Healthy manual-caption timelines are returned unchanged.

## Activation

Run:

```bash
node maintenance/apply-manifest.mjs
```

This changes only two manifest entry points:

```text
background.service_worker
  -> maintenance/runtime/background-wrapper.js

content_scripts[content_guard].js
  -> maintenance/runtime/content-prelude.js
  -> content_guard.js
```

## Verification

```bash
node --test maintenance/tests/*.test.mjs
node maintenance/apply-manifest.mjs
node --check maintenance/runtime/provider-fetch-shim.js
node --check maintenance/runtime/content-prelude.js
node --check maintenance/runtime/background-wrapper.js
node -e "JSON.parse(require('fs').readFileSync('manifest.json', 'utf8'))"
```
