# Cursor chat titles

Prefix Cursor agent chat titles with `PR-1234 · topic` when `gh pr create` succeeds.

Cursor stores the live title in memory. This writes the prefixed name to `composerHeaders` only, queues a UI rename, and reapplies it after quit. It does not rewrite `composerData`; that path stored blobs and left chats stuck on “Loading chat”.

## Install

```bash
./install.sh
```

Then:

1. Merge `examples/hooks.json` into `~/.cursor/hooks.json`.
2. Merge `examples/mcp.json` into `~/.cursor/mcp.json` (the path is filled in by `install.sh`).
3. Copy `rules/chat-title-pr-branch.mdc` into `~/.cursor/rules/` if it is not there already.
4. Copy `skills/rename-chat-pr/SKILL.md` into `~/.cursor/skills/rename-chat-pr/`.
5. Reload Cursor so the local extension loads.

Optional, macOS: `./install.sh --launchd` installs a user agent that reapplies stored titles every two minutes.

## Layout

| Path | Role |
|---|---|
| `hooks/prefix-pr-chat-title.mjs` | Cursor hook after `gh pr create` |
| `hooks/lib/chat-title.mjs` | Title prefixing, SQLite writes, inbox queue |
| `mcp-servers/rename-chat/` | `rename_chat` MCP for the agent |
| `extension/` | Applies queued titles via `composer.updateTitle` |
| `hooks/apply-sticky-chat-titles.mjs` | Reapplies stored titles to Cursor’s DB |

## Tests

```bash
node --test hooks/lib/chat-title.test.mjs
```

Requires `sqlite3` on `PATH`. macOS only for the DB writes (Cursor’s `state.vscdb`).
