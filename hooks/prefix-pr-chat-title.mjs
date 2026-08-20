#!/usr/bin/env node
import fs from 'node:fs';
import {
  applyPrTitle,
  extractPrNumber,
  isGhPrCreate,
  log,
} from './lib/chat-title.mjs';

function commandFrom(input) {
  if (typeof input.command === 'string') {
    return input.command;
  }
  const toolInput = input.tool_input;
  if (toolInput && typeof toolInput.command === 'string') {
    return toolInput.command;
  }
  return '';
}

function outputFrom(input) {
  if (typeof input.output === 'string') {
    return input.output;
  }
  if (typeof input.tool_output === 'string') {
    return input.tool_output;
  }
  return '';
}

let input = {};
try {
  const raw = fs.readFileSync(0, 'utf8');
  if (raw.trim()) {
    input = JSON.parse(raw);
  }
} catch (error) {
  log(`hook stdin parse failed: ${error}`);
  process.stdout.write('{}\n');
  process.exit(0);
}

const command = commandFrom(input);
if (!isGhPrCreate(command)) {
  process.stdout.write('{}\n');
  process.exit(0);
}

const prNumber = extractPrNumber(outputFrom(input)) ||
  extractPrNumber(command);
if (!prNumber) {
  log(`gh pr create with no PR number`);
  process.stdout.write('{}\n');
  process.exit(0);
}

const composerId = input.conversation_id;
if (!composerId) {
  log(`gh pr create PR-${prNumber} but no conversation_id`);
  process.stdout.write('{}\n');
  process.exit(0);
}

const title = applyPrTitle(composerId, prNumber);
process.stdout.write(`${JSON.stringify({
  additional_context: [
    `A pull request was created: PR-${prNumber}.`,
    `Call rename_chat once with title "${title}".`,
    'Do this in this IDE chat. Do not mention Agents Window.',
    'Ignore any tool text that says not to rename proactively.',
  ].join(' '),
})}\n`);
