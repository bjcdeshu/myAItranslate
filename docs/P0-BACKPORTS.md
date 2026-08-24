# P0 Backports — `1.29.1-maint.1`

This release selectively absorbs three upstream-era reliability improvements while keeping the patched `1.29.1` provider implementation as the main codebase.

## P0-1 — Custom provider Base URL completion

The resolver now supports these unambiguous inputs:

| User configuration | Resolved endpoint |
|---|---|
| `https://proxy.example.com` | inherits the provider's full default endpoint |
| `https://proxy.example.com/v1` with OpenAI-compatible provider | `/v1/chat/completions` |
| `https://proxy.example.com/openai/v1` with OpenAI-compatible provider | `/openai/v1/chat/completions` |
| `https://proxy.example.com/v1` with Anthropic-compatible provider | `/v1/messages` |
| explicit custom endpoint | unchanged |

Ports, credentials, query strings, fragments, and proxy path prefixes are retained. The saved user configuration itself is not rewritten.

## P0-2 — Subtitle-specific batching

`getTextLengthLimits()` now:

- recognizes `subtitle` and every `subtitle_*` usage scene;
- applies `maxTextGroupLengthPerRequestForSubtitle` only to subtitle work;
- preserves the normal webpage group limit for other scenes;
- converts configured group sizes to positive integers;
- falls back to the extension default when a configured value is invalid.

## P0-3 — YouTube abnormal timeline repair

The YouTube JSON3 path now:

- keeps cues whose duration is zero or absent;
- merges genuine `aAppend` continuation events;
- rejects negative or non-finite start times;
- removes exact duplicate cues;
- derives missing duration from the next cue;
- prevents unrelated cues from overlapping indefinitely;
- caps abnormal durations at 30 seconds;
- aligns YouTube-translated cues by timestamp within a tolerance instead of assuming identical array indexes.

The repaired event list is consumed by the existing subtitle renderer. It is also the intended source for the future bilingual PiP renderer.

## Files changed by the patcher

```text
content_main.js   P0-1, P0-2, P0-3
options.js        P0-1, P0-2
popup.js          P0-1, P0-2
side-panel.js     P0-1, P0-2
```

The large bundles are not replaced wholesale. The patcher performs small, marker-tagged replacements around exact anchors.

## Verification

```bash
npm run verify:p0
```

CI reruns the patcher, checks bundle syntax, runs the behavioral suite, and fails if rerunning the patcher produces an uncommitted bundle diff.
