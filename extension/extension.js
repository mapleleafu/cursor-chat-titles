const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const vscode = require('vscode');

const INBOX = path.join(os.homedir(), '.cursor/chat-title-inbox');
const STICKY = path.join(os.homedir(), '.cursor/chat-titles');
const LOG = path.join(os.homedir(), '.cursor/hooks/chat-title.log');
const APPLY = path.join(os.homedir(), '.cursor/hooks/apply-sticky-chat-titles.mjs');

function log(message) {
  try {
    fs.appendFileSync(LOG, `${new Date().toISOString()} ext ${message}\n`);
  } catch {
    // ignore
  }
}

async function applyRename(composerId, title) {
  try {
    await vscode.commands.executeCommand(
      'composer.updateTitle',
      composerId,
      title,
    );
    log(`ran composer.updateTitle ${composerId} -> ${title}`);
  } catch (error) {
    log(`composer.updateTitle failed: ${error}`);
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function drainInbox() {
  if (!fs.existsSync(INBOX)) {
    fs.mkdirSync(INBOX, { recursive: true });
    return;
  }
  const names = fs.readdirSync(INBOX).filter(name =>
    name.endsWith('.json') && !name.endsWith('.tmp.json')
  ).sort();
  for (const name of names) {
    const filePath = path.join(INBOX, name);
    try {
      const item = readJson(filePath);
      if (item.composerId && item.title) {
        await applyRename(item.composerId, item.title);
      }
      fs.unlinkSync(filePath);
    } catch (error) {
      log(`inbox ${name}: ${error}`);
    }
  }
}

async function applyStickies() {
  if (!fs.existsSync(STICKY)) {
    return;
  }
  for (const name of fs.readdirSync(STICKY)) {
    if (!name.endsWith('.json')) {
      continue;
    }
    try {
      const item = readJson(path.join(STICKY, name));
      if (item.composerId && item.title) {
        await applyRename(item.composerId, item.title);
      }
    } catch (error) {
      log(`sticky ${name}: ${error}`);
    }
  }
}

function spawnApply(delayMs) {
  spawn(process.execPath, [APPLY], {
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      CURSOR_TITLE_DELAY_MS: String(delayMs || 0),
    },
  }).unref();
}

function activate(context) {
  fs.mkdirSync(INBOX, { recursive: true });
  spawnApply(0);
  void drainInbox();
  const watcher = fs.watch(INBOX, () => {
    void drainInbox();
  });
  const timer = setInterval(() => {
    void drainInbox();
  }, 2000);
  context.subscriptions.push({
    dispose() {
      watcher.close();
      clearInterval(timer);
    },
  });
  void (async () => {
    await drainInbox();
    await applyStickies();
  })();
}

function deactivate() {
  spawnApply(2500);
}

module.exports = { activate, deactivate };
