# Final Only for Claude Code

Make each turn’s final answer easier to find, while keeping links, selection, copy, and scrolling native to Claude.

Despite the name, this mod **highlights the final answer**. It leaves intermediate updates, thinking, and tool calls available. It does not change what the model writes or modify saved conversations.

## Install

Requires a Claude Code build with TypeScript mods support and Python 3 available as `python3`. Tested with Claude Code **2.1.300** and the Claude desktop app on macOS. This is a Claude **Code** mod, not a browser extension or a plugin for ordinary claude.ai chats.

```sh
claude plugin marketplace add keshavatearth/claude-final-only
claude plugin install final-only@keshav-mods
```

Open a Code session in Claude Desktop or the terminal. The highlight is on by default. Run `/final-only` to turn it off or back on; the preference is saved locally.

Update an existing installation with:

```sh
claude plugin marketplace update keshav-mods
claude plugin update final-only@keshav-mods
```

Claude Desktop can reload an updated mod in an idle session. If your client does not, reopen the session. A terminal session needs to be restarted to load an installed update.

## Appearance and interactions

- **Desktop:** final answers have a full rounded accent border. The interior stays transparent so Claude’s selection highlight remains visible.
- **Terminal:** final answers keep the rounded, accent-colored box and theme-aware background.
- **Other remote surfaces:** use the unfilled outline too; VS Code and mobile have automated render-contract coverage but have not been checked manually.

The border wraps exactly one unchanged native response. The mod does not turn answers into quotes, duplicate their text, replace links or code blocks, add click handlers, or constrain their height/scrolling. Normal response actions remain Claude’s. Display styling does not change the saved response or clipboard contents.

Version 0.3.3 removes the desktop background layer that interfered with visible selection, avoids unnecessary delayed redraws of settled answers, and hardens message identification. See the [mods render API](https://code.claude.com/docs/en/plugins/mods/interface) for the wrapper contract.

## How it works

The mod tracks main-conversation text rows and marks the last one when the turn ends. It reads the current session’s local JSONL transcript to identify answers in resumed conversations and to match Desktop’s message/block IDs to transcript rows. A temporary text match covers the delay before the transcript is written; repeated text is treated as ambiguous instead of guessing.

The transcript helper accepts compact and spaced JSON, handles multiple text blocks, and skips partial writes and subagent rows. If a message cannot be identified, it stays in Claude’s normal rendering.

The mod makes no network requests or model calls. It reads the current transcript and runs the bundled Python helper locally. It stores the on/off setting and bounded local load diagnostics (version, timestamp, turn count, and transcript path) in Claude’s plugin store. No chat data or diagnostics are included in this repository.

## Development

```sh
git clone https://github.com/keshavatearth/claude-final-only.git
cd claude-final-only
./scripts/check.sh
```

To try a local checkout, start `claude --plugin-dir .`. Avoid loading a second copy alongside an installed copy of the same mod. Claude writes its engine-specific TypeScript declarations into `.claude-plugin/types/` when it loads a development mod. These generated declarations are gitignored. After they exist, `tsc --project tsconfig.json` checks the source with TypeScript 5.4 or newer.

The mod tests exercise the engine’s real hook chain and returned render tree, including the native-engine response contract, live and resumed messages, summaries, ambiguous text, and the toggle. They do not emulate the desktop browser. For a release, also check a real desktop answer: select across paragraphs, copy the selection, open a web link and local file link, copy a code block, and scroll a long answer with the highlight on and off.

Mods are an evolving Claude Code API. See [Anthropic’s mods reference](https://code.claude.com/docs/en/plugins/mods/reference). If an update changes the rendering contract, `/final-only` restores ordinary rendering immediately.

## License

MIT. An independent project by Keshav, not affiliated with Anthropic.
