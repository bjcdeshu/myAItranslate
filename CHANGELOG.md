# Changelog

## 1.29.1-maint.1 — 2026-08-24

### P0 provider compatibility

- Completed OpenAI-compatible Base URLs ending at `/` or `/v1` with the expected chat-completions endpoint.
- Completed Anthropic-compatible Base URLs ending at `/` or `/v1` with the messages endpoint.
- Preserved explicit custom endpoints and the user's stored configuration.

### P0 subtitle batching

- Applied the dedicated subtitle request-group limit to `subtitle` and all `subtitle_*` scenes.
- Kept normal webpage batching independent.
- Normalized group sizes to safe positive integers with fallback behavior.

### P0 YouTube timeline reliability

- Retained zero-duration, missing-duration, and append JSON3 cues.
- Added invalid-timestamp filtering, duplicate removal, duration inference, overlap trimming, and a 30-second duration cap.
- Replaced index-only translated-caption pairing with timestamp-based alignment.

### Maintenance

- Added an idempotent, anchor-checked patcher for the compiled bundles.
- Added behavioral fixtures, tests, bundle syntax checks, and GitHub Actions regression verification.
