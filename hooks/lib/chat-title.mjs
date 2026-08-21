import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const STATE_DB = path.join(
  os.homedir(),
  'Library/Application Support/Cursor/User/globalStorage/state.vscdb',
);
export const QUEUE_PATH = path.join(os.homedir(), '.cursor/chat-title-queue.jsonl');
export const INBOX_DIR = path.join(os.homedir(), '.cursor/chat-title-inbox');
export const STICKY_DIR = path.join(os.homedir(), '.cursor/chat-titles');
export const LOG_PATH = path.join(os.homedir(), '.cursor/hooks/chat-title.log');

const WORKBENCH_DIR = path.join(
  '/Applications/Cursor.app/Contents/Resources/app/out/vs/workbench',
);

const DESKTOP_PATCH = {
  file: 'workbench.desktop.main.js',
  from: 'async run(e,t,n){e.get(fb).updateComposerTitle(t,n)}',
  to: 'async run(e,t,n){e.get(fb).updateComposerTitle(t,n);try{await e.get(Hh).renameComposer(t,n)}catch{}}',
};

const GLASS_PATCH = {
  file: 'workbench.glass.main.js',
  from: 'async run(t,e,n){t.get(ry).updateComposerTitle(e,n)}',
  to: 'async run(t,e,n){t.get(ry).updateComposerTitle(e,n);try{await t.get(Xp).renameComposer(e,n)}catch{}}',
};

const PR_URL_RE = /github\.com\/[^/\s]+\/[^/\s]+\/pull\/(\d+)/i;
const GH_JSON_NUMBER_RE = /"number"\s*:\s*(\d+)/;

export function log(message) {
  const line = `${new Date().toISOString()} ${message}\n`;
  try {
    fs.appendFileSync(LOG_PATH, line);
  } catch {
    // ignore
  }
}

export function extractPrNumber(text) {
  if (!text) {
    return undefined;
  }
  const urlMatch = text.match(PR_URL_RE);
  if (urlMatch) {
    return urlMatch[1];
  }
  const jsonMatch = text.match(GH_JSON_NUMBER_RE);
  if (jsonMatch) {
    return jsonMatch[1];
  }
  return undefined;
}

export function isGhPrCreate(command) {
  if (!command) {
    return false;
  }
  return /(^|[\s;&|(`'"/])gh\s+pr\s+create\b/.test(command);
}

export function buildPrefixedTitle(currentName, prNumber, topic) {
  const prefix = `PR-${prNumber}`;
  const cleaned = (currentName || '').trim();
  if (
    !topic &&
    (cleaned.startsWith(`${prefix} `) ||
      cleaned.startsWith(`${prefix}·`) ||
      cleaned.startsWith(`${prefix} ·`))
  ) {
    return cleaned;
  }
  const source = topic || cleaned;
  const withoutOldPrefix = source.replace(/^PR-\d+\s*·\s*/, '').trim();
  const rest = (withoutOldPrefix || 'Chat').slice(0, 80);
  return `${prefix} · ${rest}`;
}

function sqlite(sql, args) {
  const quotedArgs = args.map(arg => {
    if (typeof arg === 'number') {
      return String(arg);
    }
    return `'${String(arg).replaceAll("'", "''")}'`;
  });
  let bound = sql;
  for (const arg of quotedArgs) {
    bound = bound.replace('?', arg);
  }
  return execFileSync(
    'sqlite3',
    ['-readonly', STATE_DB, bound],
    { encoding: 'utf8', timeout: 2000 },
  ).trim();
}

function sqliteWrite(sql) {
  execFileSync(
    'sqlite3',
    [STATE_DB, `PRAGMA busy_timeout=5000;${sql}`],
    { encoding: 'utf8', timeout: 8000 },
  );
}

export function getComposerHeader(composerId) {
  if (!composerId || !fs.existsSync(STATE_DB)) {
    return undefined;
  }
  try {
    const raw = sqlite(
      'SELECT value FROM composerHeaders WHERE composerId = ?',
      [composerId],
    );
    if (!raw) {
      return undefined;
    }
    return JSON.parse(raw);
  } catch (error) {
    log(`getComposerHeader failed: ${error}`);
    return undefined;
  }
}

export function writeSticky(composerId, title) {
  fs.mkdirSync(STICKY_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(STICKY_DIR, `${composerId}.json`),
    `${JSON.stringify({ composerId, title, updatedAt: Date.now() })}\n`,
  );
}

export function enqueueRename(composerId, title) {
  fs.mkdirSync(INBOX_DIR, { recursive: true });
  const file = path.join(
    INBOX_DIR,
    `${Date.now()}-${composerId}.json`,
  );
  const tmp = `${file}.tmp`;
  fs.writeFileSync(
    tmp,
    `${JSON.stringify({ composerId, title, at: Date.now() })}\n`,
  );
  fs.renameSync(tmp, file);
}

export function listInboxJobs() {
  if (!fs.existsSync(INBOX_DIR)) {
    return [];
  }
  return fs
    .readdirSync(INBOX_DIR)
    .filter(name => name.endsWith('.json') && !name.endsWith('.tmp.json'))
    .sort()
    .map(name => path.join(INBOX_DIR, name));
}

export function readInboxJob(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  const item = JSON.parse(raw);
  if (!item.composerId || !item.title) {
    throw new Error('inbox job missing composerId or title');
  }
  return item;
}

export function listStickyTitles() {
  if (!fs.existsSync(STICKY_DIR)) {
    return [];
  }
  const out = [];
  for (const name of fs.readdirSync(STICKY_DIR)) {
    if (!name.endsWith('.json')) {
      continue;
    }
    try {
      const item = JSON.parse(
        fs.readFileSync(path.join(STICKY_DIR, name), 'utf8'),
      );
      if (item.composerId && item.title) {
        out.push(item);
      }
    } catch (error) {
      log(`sticky parse failed ${name}: ${error}`);
    }
  }
  return out;
}

export function setComposerName(composerId, title, options = {}) {
  if (!composerId || !title) {
    return false;
  }
  const enqueueMode = options.enqueue || 'if-changed';
  const header = getComposerHeader(composerId);
  if (!header) {
    log(`setComposerName: no header for ${composerId}`);
    writeSticky(composerId, title);
    if (enqueueMode !== 'never') {
      enqueueRename(composerId, title);
    }
    return false;
  }
  if (header.name === title) {
    writeSticky(composerId, title);
    return true;
  }
  writeSticky(composerId, title);
  if (enqueueMode === 'always' || enqueueMode === 'if-changed') {
    enqueueRename(composerId, title);
  }
  const next = {
    ...header,
    name: title,
    lastUpdatedAt: Date.now(),
  };
  const payload = JSON.stringify(next).replaceAll("'", "''");
  try {
    sqliteWrite(
      `UPDATE composerHeaders SET value = '${payload}', lastUpdatedAt = ${next.lastUpdatedAt} WHERE composerId = '${composerId.replaceAll("'", "''")}';`,
    );
    log(`setComposerName ${composerId} -> ${title}`);
    return true;
  } catch (error) {
    log(`setComposerName failed: ${error}`);
    return false;
  }
}

export function applyPrTitle(composerId, prNumber, topic) {
  const header = getComposerHeader(composerId);
  const title = buildPrefixedTitle(header?.name, prNumber, topic);
  setComposerName(composerId, title, { enqueue: 'always' });
  return title;
}

export function applyAllStickyTitles() {
  const items = listStickyTitles();
  let applied = 0;
  for (const item of items) {
    if (setComposerName(item.composerId, item.title, { enqueue: 'never' })) {
      applied += 1;
    }
  }
  return applied;
}

export function latestComposerId() {
  if (!fs.existsSync(STATE_DB)) {
    return undefined;
  }
  try {
    const id = execFileSync(
      'sqlite3',
      [
        '-readonly',
        STATE_DB,
        'SELECT composerId FROM composerHeaders WHERE isArchived = 0 AND isSubagent = 0 ORDER BY recency DESC LIMIT 1;',
      ],
      { encoding: 'utf8', timeout: 2000 },
    ).trim();
    return id || undefined;
  } catch (error) {
    log(`latestComposerId failed: ${error}`);
    return undefined;
  }
}

function patchWorkbenchFile(spec) {
  const filePath = path.join(WORKBENCH_DIR, spec.file);
  if (!fs.existsSync(filePath)) {
    return { file: spec.file, status: 'missing' };
  }
  const source = fs.readFileSync(filePath, 'utf8');
  if (source.includes(spec.to)) {
    return { file: spec.file, status: 'already' };
  }
  if (!source.includes(spec.from)) {
    return { file: spec.file, status: 'pattern-miss' };
  }
  const next = source.replace(spec.from, spec.to);
  if (next === source) {
    return { file: spec.file, status: 'pattern-miss' };
  }
  const backup = `${filePath}.rename-chat.bak`;
  if (!fs.existsSync(backup)) {
    fs.copyFileSync(filePath, backup);
  }
  fs.writeFileSync(filePath, next);
  return { file: spec.file, status: 'patched' };
}

function inspectWorkbenchFile(spec) {
  const filePath = path.join(WORKBENCH_DIR, spec.file);
  if (!fs.existsSync(filePath)) {
    return { file: spec.file, status: 'missing' };
  }
  const source = fs.readFileSync(filePath, 'utf8');
  if (source.includes(spec.to)) {
    return { file: spec.file, status: 'already' };
  }
  if (!source.includes(spec.from)) {
    return { file: spec.file, status: 'pattern-miss' };
  }
  return { file: spec.file, status: 'needed' };
}

export function inspectWorkbenchRenamePatch() {
  return [DESKTOP_PATCH, GLASS_PATCH].map(inspectWorkbenchFile);
}

export function ensureWorkbenchRenamePatch() {
  const results = [DESKTOP_PATCH, GLASS_PATCH].map(spec => {
    try {
      return patchWorkbenchFile(spec);
    } catch (error) {
      log(`patch ${spec.file} failed: ${error}`);
      return { file: spec.file, status: 'error', error: String(error) };
    }
  });
  for (const result of results) {
    log(`workbench patch ${result.file}: ${result.status}`);
  }
  return results;
}
