# Selective Backport Roadmap

The reference point when this maintenance repository was established was official release `1.32.7` (2026-08-21).

## Completed — `1.29.1-maint.1`

| Priority | Backport | Status |
|---|---|---|
| P0 | Custom API Base URL completion around official 1.30.2 | Completed |
| P0 | Subtitle request grouping around official 1.29.9 | Completed and hardened |
| P0 | YouTube abnormal timeline handling around official 1.32.1 | Completed |

Implementation and verification details are in [`P0-BACKPORTS.md`](P0-BACKPORTS.md).

## Next P0 candidates

- Review newer translation-service switching and error-state behavior. Backport only changes that improve reliability without altering the fork's custom provider semantics.
- Review the YouTube subtitle auto-enable fix from the later 1.32.x line.

## P1 — Subtitle UX

Candidate improvements:

- bilingual subtitle switching from the subtitle shortcut menu
- later subtitle shortcut/menu interaction improvements
- target-language switching feedback and multiple-player handling where useful

## P1 — Site/runtime controls

- per-site “do not use extension” configuration
- selected performance and stability changes that can be isolated

## Fork feature — bilingual Document PiP

Preferred architecture:

```text
subtitle acquisition / translation
               │
       normalized cue state
          ┌────┴────┐
          ↓         ↓
   page renderer  PiP renderer
```

The PiP renderer should consume the fork's already-translated, normalized cue state. It should not independently fetch YouTube `timedtext` captions and should not scrape the final rendered subtitle DOM.
