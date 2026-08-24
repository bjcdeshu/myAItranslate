# Immersive Translate Maintained Build

Private long-term maintenance baseline for a patched Immersive Translate 1.29.1 Chrome extension build.

## Maintenance policy

- `main` is based on the existing patched 1.29.1 build and preserves its custom translation-provider behavior.
- Do **not** wholesale replace this tree with newer official bundles.
- Treat the current official `immersive-translate/immersive-translate` `dist/chrome` output as a **reference upstream**, not as source code.
- Backport fixes and behaviors selectively, with provider compatibility and subtitle behavior as the highest priorities.
- Keep new features isolated when possible so future upstream comparison stays tractable.

## Baseline

- Initial baseline commit: `6c0b9cc47fc6a98b21a9c14c64fe54934079e2f6`
- Baseline tag: `baseline-1.29.1-patched`
- Baseline contents: 87 files from the supplied packaged Chrome extension.
- This repository starts from compiled production artifacts rather than the original source tree.

See:

- [`docs/BASELINE.md`](docs/BASELINE.md)
- [`docs/UPSTREAM.md`](docs/UPSTREAM.md)
- [`docs/ROADMAP.md`](docs/ROADMAP.md)
