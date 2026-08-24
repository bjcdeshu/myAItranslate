# myAItranslate

Long-term maintenance fork of a patched Immersive Translate `1.29.1` Chrome extension build.

## Maintenance policy

- `main` preserves the existing custom translation-provider behavior as the primary baseline.
- New official builds are reference upstreams, not drop-in replacements.
- Fixes are backported selectively and recorded as deterministic patches against the compiled bundles.
- Provider compatibility and subtitle reliability take priority over feature parity.

## Current maintenance release

`1.29.1-maint.1` contains the first three P0 backports:

1. OpenAI-compatible and Anthropic-compatible Base URL endpoint completion.
2. Subtitle-specific request batching for all `subtitle_*` scenes, with safe numeric limits.
3. YouTube JSON3 timeline repair and timestamp-based translated-caption alignment.

The implementation is reproducible:

```bash
npm run verify:p0
```

The patcher is idempotent and fails when its known bundle anchors no longer match. See [`docs/P0-BACKPORTS.md`](docs/P0-BACKPORTS.md) and [`maintenance/README.md`](maintenance/README.md).

## Baseline

- Initial baseline commit: `6c0b9cc47fc6a98b21a9c14c64fe54934079e2f6`
- Baseline tag: `baseline-1.29.1-patched`
- Baseline contents: 87 files from the supplied packaged Chrome extension.
- This repository starts from compiled production artifacts rather than the original source tree.

Further documentation:

- [`docs/BASELINE.md`](docs/BASELINE.md)
- [`docs/UPSTREAM.md`](docs/UPSTREAM.md)
- [`docs/ROADMAP.md`](docs/ROADMAP.md)
