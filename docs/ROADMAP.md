# Selective Backport Roadmap

The reference point when this maintenance repository was established was official release `1.32.7` (2026-08-21).

## P0 — Provider compatibility

### Custom API endpoint normalization (official 1.30.2)

Official behavior added automatic completion of OpenAI/Anthropic endpoint paths from a custom Base URL.

Why it matters here: custom providers are the main reason this fork exists. This should be investigated before unrelated UI upgrades.

### Translation-service switching/error handling (official 1.32.7)

Review newer service-switching behavior and error-state handling. Backport only if it improves reliability without changing existing provider semantics.

## P0 — Video subtitle reliability

Investigate and selectively port:

- online subtitle request batching/paragraph-limit behavior introduced around 1.29.9
- YouTube abnormal subtitle-timeline handling fixed in 1.32.1
- YouTube subtitle auto-enable fix in 1.32.6

These changes directly affect the planned bilingual PiP work and should be understood before adding another renderer.

## P1 — Subtitle UX

Candidate improvements:

- bilingual subtitle switching from the subtitle shortcut menu (1.30.3)
- later subtitle shortcut/menu interaction improvements (1.31.x–1.32.5)
- target-language switching feedback and multi-player handling where useful

## P1 — Site/runtime controls

- per-site "do not use extension" configuration (1.31.9)
- selected performance/stability improvements where they can be isolated

## Planned fork-specific feature — bilingual Document PiP

Preferred architecture:

```text
Immersive Translate subtitle acquisition/translation
                    │
              current cue state
                 ┌──┴──┐
                 ↓     ↓
          page renderer  PiP renderer
```

The PiP renderer should consume Immersive Translate's already-translated cue state. It should not independently fetch YouTube `timedtext` captions and should not scrape the final rendered subtitle DOM.

A useful reference implementation is `mehmetkahya0/youtube-pip-subtitles`, but only its Document Picture-in-Picture window/video/lifecycle ideas should be reused; its independent caption acquisition/synchronization pipeline is unnecessary here.
