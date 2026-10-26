# Desktop file-link verification — 2026-10-26

Tested in a real Claude Code conversation on macOS, with local fixture files. The app stayed open throughout the tests. The v0.4.3 candidate was loaded locally before publication, with highlighting enabled.

| Destination in the stored answer | Before the fix | With v0.4.3 |
| --- | --- | --- |
| Angle brackets, absolute path without spaces | File button became non-clickable inline code | Correct file contents opened |
| Angle brackets, absolute path with a literal space | File button became non-clickable inline code | Correct file contents opened |
| Angle brackets, absolute path with an existing `%20` escape | File button became non-clickable inline code | Correct file contents opened |

Controls before the fix: an ordinary absolute path, an ordinary percent-encoded path containing a space, and a relative path valid from the session root all opened their fixture contents. Thus a click event or a path containing a space was not sufficient to explain the failure; the angle-bracket destination was isolated separately.

After loading the candidate, the original failing controls were clicked again and the actual preview contents were checked. A real Markdown document with a space in its parent folder also opened from its original angle-bracket link. Two other real documents opened through corrected absolute targets. Stored assistant text still contained the original angle-bracket syntax after rendering.

Separate from the syntax bug, a relative link pointing outside the file's actual location opened a missing-file preview. v0.4.3 preserves relative path semantics; it does not search for a different file with a matching name.

Automated validation: plugin validation, TypeScript checking, 15 mod tests, and 2 Python transcript-index tests passed. Tests cover the targeted rewrite, existing escapes, web links, images, code examples, the native-engine wrapper, the toggle, and unchanged behavior on other surfaces.
