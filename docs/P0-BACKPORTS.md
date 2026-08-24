# P0 Backports — maintenance iteration 1

## Scope

This iteration selectively absorbs three high-priority behaviors without replacing the patched 1.29.1 production bundles.

| P0 | Reference | Result |
|---|---|---|
| Custom OpenAI/Anthropic Base URL completion | official 1.30.2 | Added as a fail-open background fetch compatibility layer |
| Provider-specific subtitle request grouping | official 1.29.9 | Confirmed already present in the patched baseline and protected by regression tests |
| YouTube abnormal subtitle timeline handling | official 1.32.1 | Added as a pre-parser JSON3 timeline normalizer |

## Design boundary

```text
manifest
├─ background wrapper
│  ├─ provider endpoint compatibility
│  └─ original background.js
└─ content prelude
   ├─ abnormal YouTube timedtext normalization
   └─ original content_guard.js -> content_main.js
```

The existing custom-provider implementation remains authoritative. The compatibility layer does not rewrite saved settings and does not replace explicit API endpoints.

The YouTube layer only changes payloads that exhibit abnormal timing or scrolling-ASR markers. Valid manual-caption timelines pass through by identity.

## Subtitle batching audit

The baseline already contains all three required surfaces:

- runtime field `maxTextGroupLengthPerRequestForSubtitle`
- settings/default configuration for that field
- subtitle usage-scene routing

Adding another batching implementation would create two competing grouping paths, so this iteration intentionally preserves the existing runtime path and adds an executable regression audit instead.

## Future dependency

The normalized cue stream is intended to become the shared input for both the existing page subtitle renderer and the planned bilingual Document Picture-in-Picture renderer.
