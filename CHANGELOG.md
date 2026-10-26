# Changelog

## 0.4.3 — 2026-10-26

- Normalize angle-bracket local file destinations in active Desktop final answers into ordinary Markdown destinations, encoding spaces and parentheses. This addresses a reproduced Desktop file-open failure while preserving the rounded border and native response.
- Preserve existing escapes, external URLs, images, and code examples. Other surfaces and saved transcripts are unchanged.
- Add syntax regression tests and a native-engine render-contract test for the targeted rewrite.
- Verify the fix in Claude Desktop before publication: three previously failing fixture controls and a real document open their contents with highlighting on. See [desktop verification](docs/desktop-verification.md).

## 0.4.2 — 2026-10-26

- Restore the v0.4.0 rendering behavior, including borders on answers containing links or code.
- Withdraw v0.4.1’s speculative wrapper bypass. Its link-failure diagnosis was not reproduced before release, and the bypass removed highlighting from most answers.

## 0.4.1 — 2026-10-26 (superseded)

- Skipped remote borders for answers containing links, code, or paths. This workaround was published without establishing that the mod caused the reported file-link problem. Use v0.4.2 instead.

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
