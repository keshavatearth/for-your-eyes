# Changelog

## 0.4.0 — 2026-10-17

- Rename the mod, command, and repository to **For Your Eyes** (`for-your-eyes`).
- Add the tagline “Put the final answer in focus” and migration instructions for existing Final Only installations.
- Keep the rounded border and native interaction fixes from 0.3.3.

## 0.3.3 — 2026-10-17

- Preserve the full rounded border and original Markdown. Use a transparent interior on desktop and other remote surfaces so native text selection stays visible.
- Keep exactly one unchanged engine response inside a decoration-only wrapper. Native web links, file references, code blocks, copy controls and scrolling remain available.
- Avoid unnecessary delayed redraws after a settled answer, and skip summary rows.
- Preserve word boundaries in live matching; do not guess when multiple rows have the same text.
- Parse message IDs from JSON instead of depending on compact JSON spacing. Respect each message’s text-block index.
- Clear transcript lookup caches when a session ends or the mod reloads, and discard stale index loads.
- Add render-contract and transcript-helper regression tests, installation instructions, a one-command check script, an MIT license, and a public marketplace manifest.

## 0.2.3

Local release: highlight final answers in a bordered box; support new and resumed sessions and late transcript writes.
