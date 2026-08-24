# Maintenance layer

This directory makes selective changes to the compiled `1.29.1` baseline reviewable and reproducible.

## Layout

```text
maintenance/
├─ patches/       deterministic bundle patchers
├─ reference/     readable reference implementations used by tests
├─ fixtures/      regression inputs, including abnormal YouTube JSON3
└─ tests/         behavioral and generated-bundle checks
```

## P0 backports

### Provider endpoint completion

The original resolver already handled a host-only custom URL. The backport also treats a path ending in `/v1` as an unambiguous Base URL:

- OpenAI-compatible endpoint: append `/chat/completions`
- Anthropic-compatible endpoint: append `/messages`
- explicit custom endpoints: preserve unchanged

The provider's existing default endpoint determines the protocol; no request-time header or domain heuristics are introduced.

### Subtitle request batching

The baseline already exposed `maxTextGroupLengthPerRequestForSubtitle`. The backport hardens the selector so every `subtitle_*` scene uses it, while webpage translation continues using `maxTextGroupLengthPerRequest`. Group sizes are normalized to positive integers and invalid values fall back safely.

### YouTube timeline normalization

The YouTube handler now normalizes JSON3 cues before rendering or translation alignment:

- retain zero-duration, missing-duration, and append events
- reject invalid timestamps and remove exact duplicates
- infer missing durations and trim pathological overlap
- cap extreme cue duration at 30 seconds
- align translated cues by timestamp tolerance rather than array index

The normalized cue shape remains compatible with the existing page renderer and can later feed a bilingual Document Picture-in-Picture renderer.

## Commands

```bash
npm run patch:p0      # apply all three deterministic bundle patches
npm test              # run behavioral and generated-bundle tests
npm run verify:p0     # patch, syntax-check bundles, and test
```

`apply-p0-backports.mjs` is idempotent. Each replacement uses a known anchor and aborts if the expected target is missing or duplicated.
