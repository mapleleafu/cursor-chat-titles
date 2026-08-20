import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  INBOX_DIR,
  buildPrefixedTitle,
  enqueueRename,
  listInboxJobs,
  readInboxJob,
} from './chat-title.mjs';

test('buildPrefixedTitle keeps an already-prefixed name', () => {
  assert.equal(
    buildPrefixedTitle('PR-1234 · Fix login timeout', '1234'),
    'PR-1234 · Fix login timeout',
  );
});

test('buildPrefixedTitle uses an explicit topic', () => {
  assert.equal(
    buildPrefixedTitle('PR-1234 · Fix login timeout', '1234', 'retry backoff'),
    'PR-1234 · retry backoff',
  );
});

test('buildPrefixedTitle prefixes a plain name', () => {
  assert.equal(
    buildPrefixedTitle('Fix login timeout', '1234'),
    'PR-1234 · Fix login timeout',
  );
});

test('inbox enqueue survives a middle-dot title', () => {
  const composerId = '00000000-0000-0000-0000-000000000001';
  const title = 'PR-1234 · Fix login timeout';
  enqueueRename(composerId, title);
  const jobs = listInboxJobs().filter(file => file.includes(composerId));
  assert.ok(jobs.length >= 1);
  const job = readInboxJob(jobs[jobs.length - 1]);
  assert.equal(job.composerId, composerId);
  assert.equal(job.title, title);
  for (const file of jobs) {
    fs.unlinkSync(file);
  }
});

test('inbox dir is under home', () => {
  assert.equal(INBOX_DIR, path.join(os.homedir(), '.cursor/chat-title-inbox'));
});
