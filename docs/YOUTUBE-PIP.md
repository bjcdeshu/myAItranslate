# YouTube bilingual Picture-in-Picture

## Goal

Provide a native always-on-top YouTube window whose subtitles come from the existing Immersive Translate subtitle pipeline, including both source text and translated text.

## Architecture

```text
YouTube caption response
  -> existing subtitle parser / normalization
  -> existing translation state
  -> active bilingual cue state
       |-> existing page renderer
       `-> Document Picture-in-Picture renderer
```

The PiP implementation must not fetch or translate a second subtitle track and must not parse rendered subtitle DOM as its primary data source.

## Initial scope

- YouTube watch pages on Chromium browsers with Document Picture-in-Picture support
- one player button to open/close the bilingual PiP window
- source-only, translation-only, and bilingual display based on current subtitle mode
- playback, seek, volume, rate and lifecycle synchronization with the original video
- SPA navigation and player replacement handling
- fallback to normal video Picture-in-Picture when Document PiP is unavailable, with a clear no-subtitle limitation

## Maintenance constraints

- preserve the patched 1.29.1 provider behavior
- implement through deterministic maintenance patches
- keep readable reference modules and tests outside compiled bundles
- no additional network endpoints, analytics or remote code
