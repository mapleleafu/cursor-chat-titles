#!/usr/bin/env node
import { ensureWorkbenchRenamePatch } from './lib/chat-title.mjs';

const results = ensureWorkbenchRenamePatch();
for (const result of results) {
  const extra = result.error ? ` ${result.error}` : '';
  console.log(`${result.file}: ${result.status}${extra}`);
}
const failed = results.filter(
  result => result.status === 'error' || result.status === 'pattern-miss' ||
    result.status === 'missing',
);
process.exit(failed.length > 0 ? 1 : 0);
