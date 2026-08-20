#!/usr/bin/env node
import readline from 'node:readline';
import {
  applyPrTitle,
  extractPrNumber,
  getComposerHeader,
  latestComposerId,
  setComposerName,
} from '../../hooks/lib/chat-title.mjs';

const TOOLS = [
  {
    name: 'rename_chat',
    description:
      'Rename the current Cursor IDE chat title. Call this after creating a PR, or when the PR/ticket id is known. Title format: PR-1234 · short topic',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'New chat title, e.g. PR-1234 · Fix login timeout',
        },
        conversation_id: {
          type: 'string',
          description: 'Optional composer/conversation id. Omit to use the latest agent chat.',
        },
      },
      required: ['title'],
    },
  },
];

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

async function callRename(args) {
  const title = String(args.title || '').trim();
  if (!title) {
    return { isError: true, text: 'title must be non-empty' };
  }
  const composerId = String(args.conversation_id || '').trim() ||
    latestComposerId();
  if (!composerId) {
    return { isError: true, text: 'could not identify the chat to rename' };
  }
  const prNumber = extractPrNumber(title) ||
    (title.match(/^PR-(\d+)/) || [])[1];
  const next = prNumber
    ? applyPrTitle(composerId, prNumber, title.replace(/^PR-\d+\s*·\s*/, ''))
    : (setComposerName(composerId, title, { enqueue: 'always' }), title);
  const header = getComposerHeader(composerId);
  return {
    isError: false,
    text: `Renamed chat to "${header?.name || next}".`,
  };
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', async line => {
  if (!line.trim()) {
    return;
  }
  let request;
  try {
    request = JSON.parse(line);
  } catch {
    return;
  }
  const { id, method, params } = request;
  if (method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: params?.protocolVersion || '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'rename-chat', version: '1.0.0' },
      },
    });
    return;
  }
  if (method === 'notifications/initialized' || method === 'initialized') {
    return;
  }
  if (method === 'tools/list') {
    send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
    return;
  }
  if (method === 'tools/call') {
    const name = params?.name;
    const args = params?.arguments || {};
    if (name !== 'rename_chat') {
      send({
        jsonrpc: '2.0',
        id,
        result: {
          isError: true,
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        },
      });
      return;
    }
    const result = await callRename(args);
    send({
      jsonrpc: '2.0',
      id,
      result: {
        isError: result.isError,
        content: [{ type: 'text', text: result.text }],
      },
    });
    return;
  }
  if (id !== undefined) {
    send({
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Method not found: ${method}` },
    });
  }
});
