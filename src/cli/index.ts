#!/usr/bin/env node

import { createRequire } from 'node:module';
import { isSea } from 'node:sea';

if (isSea()) {
  const __require = createRequire(import.meta.url);

  Object.assign(globalThis, {
    __bundlerPathsOverrides: {
      'thread-stream-worker': __require.resolve('./thread-stream-worker.js'),
      'pino/file': './pino-file.js',
      'pino-pretty': './pino-pretty.js',
      'pino-worker': './pino-worker.js',
    },
  });
}

const m = await import('./main.ts');
await m.main();
