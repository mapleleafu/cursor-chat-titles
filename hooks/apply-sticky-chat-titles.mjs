#!/usr/bin/env node
import { applyAllStickyTitles } from './lib/chat-title.mjs';

const delay = Number(process.env.CURSOR_TITLE_DELAY_MS || 0);
if (delay > 0) {
  await new Promise(resolve => setTimeout(resolve, delay));
}
const applied = applyAllStickyTitles();
console.log(`applied ${applied} sticky chat titles`);
