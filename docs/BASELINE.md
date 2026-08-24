# Baseline Notes

## What this repository is

This repository is a maintenance tree reconstructed from a packaged Immersive Translate `1.29.1` Chrome extension that already contains local patches, especially around custom translation providers.

The supplied package is a production build: major application modules (`background.js`, `content_main.js`, `options.js`, `popup.js`, `side-panel.js`) are bundled/minified and there is no original `src/` tree or source map in the package.

## Git baseline

- Branch: `main`
- Commit: `6c0b9cc47fc6a98b21a9c14c64fe54934079e2f6`
- Tag: `baseline-1.29.1-patched`
- Files: 87

The baseline commit should remain immutable. All maintenance work should happen in later commits/feature branches.

## Patch boundary vs official 1.29.1

A file-level comparison against the public official `v1.29.1` distribution shows that local changes exist in core provider/config/UI bundles, including:

- `background.js`
- `content_guard.js`
- `content_main.js`
- `default_config.json`
- `default_config.content.json`
- `locales.json`
- `manifest.json`
- `options.js`
- `popup.js`
- `side-panel.js`

Important negative finding:

- `video-subtitle/inject.js` matches official `v1.29.1` exactly.

This is useful for future work: the existing custom-provider patches are not coupled to the low-level video subtitle network hook, so subtitle/Picture-in-Picture work can be designed as a relatively isolated feature.

## Change discipline

1. Preserve custom-provider behavior first.
2. Prefer small, named feature patches over bundle-wide replacements.
3. Record the official version/behavior used as reference in each backport commit.
4. For risky bundle edits, keep a reproducible patch script or a clearly documented search anchor where practical.
5. Validate extension startup, settings/provider configuration, normal webpage translation, and YouTube subtitle translation after core bundle edits.
