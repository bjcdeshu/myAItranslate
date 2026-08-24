# Upstream Tracking

## Current upstream model

Immersive Translate is no longer open-source. The public repository is used for release artifacts and issue tracking and does not contain the original source tree.

Useful public upstream surfaces still exist:

1. `immersive-translate/immersive-translate`
   - public release repository
   - current compiled outputs under `dist/chrome`, `dist/firefox`, and `dist/userscript`
   - tags/releases allow comparing packaged behavior across versions

2. `immersive-translate/config`
   - public distribution/rule repository
   - exposes runtime configuration such as `dist/default_config.json`

3. Official changelog
   - records user-visible fixes and behavior changes and is the first filter for deciding what is worth backporting

## Maintenance implication

The project should use a **reference-upstream** workflow:

```text
our patched 1.29.1 mainline
          │
          ├── keep custom provider behavior
          │
          └── selectively backport
                    ↑
       current official dist/changelog/config
```

Do not attempt a blind version upgrade from 1.29.1 to a current production bundle. The compiled bundles have grown substantially and replacing them would risk losing the reason this fork exists.

## Public config compatibility

The local 1.29.1 build contains the remote built-in config synchronization path. The current public config advertises a minimum compatible version below 1.29.1, so the existing fork can still benefit from at least part of the public site/rule updates without replacing its engine.

This should be preserved unless a future audit shows a compatibility regression.

## Subtitle architecture note

The official current distribution still exposes a `video-subtitle/inject.js` network interception layer. Its architecture remains recognizably similar to the 1.29.1 baseline, while newer builds contain robustness changes around XHR/fetch response handling and site compatibility.

No current public artifact evidence has been found for a built-in `Document Picture-in-Picture` bilingual subtitle implementation. A custom bilingual PiP feature therefore remains a reasonable fork-specific addition.
