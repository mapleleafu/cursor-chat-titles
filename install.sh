#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
CURSOR_DIR="${CURSOR_DIR:-$HOME/.cursor}"
EXT_DIR="$CURSOR_DIR/extensions/local.ide-rename-chat-0.0.2"
LAUNCHD_DIR="$HOME/Library/LaunchAgents"
LAUNCHD_LABEL="com.cursor.chat-titles"
NODE_BIN="$(command -v node)"

mkdir -p \
  "$CURSOR_DIR/hooks/lib" \
  "$CURSOR_DIR/mcp-servers/rename-chat" \
  "$CURSOR_DIR/rules" \
  "$CURSOR_DIR/skills/rename-chat-pr" \
  "$EXT_DIR"

cp "$ROOT/hooks/prefix-pr-chat-title.mjs" "$CURSOR_DIR/hooks/"
cp "$ROOT/hooks/apply-sticky-chat-titles.mjs" "$CURSOR_DIR/hooks/"
cp "$ROOT/hooks/patch-cursor-rename.mjs" "$CURSOR_DIR/hooks/"
cp "$ROOT/hooks/lib/chat-title.mjs" "$CURSOR_DIR/hooks/lib/"
cp "$ROOT/hooks/lib/chat-title.test.mjs" "$CURSOR_DIR/hooks/lib/"
cp "$ROOT/mcp-servers/rename-chat/server.mjs" "$CURSOR_DIR/mcp-servers/rename-chat/"
cp "$ROOT/extension/extension.js" "$EXT_DIR/"
cp "$ROOT/extension/package.json" "$EXT_DIR/"
cp "$ROOT/rules/chat-title-pr-branch.mdc" "$CURSOR_DIR/rules/"
cp "$ROOT/skills/rename-chat-pr/SKILL.md" "$CURSOR_DIR/skills/rename-chat-pr/"

chmod +x \
  "$CURSOR_DIR/hooks/prefix-pr-chat-title.mjs" \
  "$CURSOR_DIR/hooks/apply-sticky-chat-titles.mjs" \
  "$CURSOR_DIR/hooks/patch-cursor-rename.mjs"

python3 - "$CURSOR_DIR/mcp-servers/rename-chat/server.mjs" "$CURSOR_DIR/mcp-rename-chat.snippet.json" <<'PY'
import json, pathlib, sys
server, dest = sys.argv[1], sys.argv[2]
data = {
  "mcpServers": {
    "rename-chat": {
      "command": "node",
      "args": [server],
    }
  }
}
pathlib.Path(dest).write_text(json.dumps(data, indent=2) + "\n")
print(dest)
PY

if [[ "${1:-}" == "--launchd" ]]; then
  if [[ -z "$NODE_BIN" ]]; then
    echo "node not on PATH; skip launchd" >&2
    exit 1
  fi
  mkdir -p "$LAUNCHD_DIR"
  python3 - "$ROOT/launchd/cursor-chat-titles.plist.template" \
    "$LAUNCHD_DIR/${LAUNCHD_LABEL}.plist" "$NODE_BIN" "$HOME" <<'PY'
import pathlib, sys
template, dest, node_bin, home = sys.argv[1:5]
text = pathlib.Path(template).read_text()
text = text.replace("__NODE__", node_bin).replace("__HOME__", home)
pathlib.Path(dest).write_text(text)
print(dest)
PY
  launchctl bootout "gui/$(id -u)/${LAUNCHD_LABEL}" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$LAUNCHD_DIR/${LAUNCHD_LABEL}.plist"
  launchctl enable "gui/$(id -u)/${LAUNCHD_LABEL}"
  echo "installed launchd ${LAUNCHD_LABEL}"
fi

echo "installed into $CURSOR_DIR"
echo "merge examples/hooks.json into $CURSOR_DIR/hooks.json"
echo "merge $CURSOR_DIR/mcp-rename-chat.snippet.json into $CURSOR_DIR/mcp.json"
echo "reload Cursor"
