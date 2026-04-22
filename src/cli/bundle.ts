#!/usr/bin/env node

import { createRequire } from 'node:module';
const __require = createRequire(import.meta.url);

declare global {
  var __bundlerPathsOverrides: Record<string, string>;
}

globalThis.__bundlerPathsOverrides = {
  'thread-stream-worker': __require.resolve('./thread-stream-worker.js'),
  'pino/file': './pino-file.js',
  'pino-pretty': './pino-pretty.js',
  'pino-worker': './pino-worker.js',
};

const m = await import('./main.ts');
await m.main();
