#!/usr/bin/env node

import { isSea } from 'node:sea';

if (isSea()) {
  Object.assign(globalThis, {
    __bundlerPathsOverrides: {
      'thread-stream-worker': new URL(
        './thread-stream-worker.js',
        import.meta.url,
      ).pathname,
      'pino/file': './pino-file.js',
      'pino-pretty': './pino-pretty.js',
      'pino-worker': './pino-worker.js',
    },
  });
}

const m = await import('./main.ts');
await m.main();
