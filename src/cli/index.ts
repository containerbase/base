#!/usr/bin/env node

import { isSea } from 'node:sea';

if (isSea()) {
  // Workaround to detect imports
  // https://github.com/yao-pkg/pkg/issues/264
  // https://github.com/yao-pkg/pkg/issues/269
  Object.assign(globalThis, {
    __bundlerPathsOverrides: {
      'thread-stream-worker': import.meta
        .resolve('./thread-stream-worker.js')
        .replace(/^file:\/\//, ''),
      'pino/file': import.meta
        .resolve('./pino-file.js')
        .replace(/^file:\/\//, ''),
      'pino-pretty': import.meta
        .resolve('./pino-pretty.js')
        .replace(/^file:\/\//, ''),
      'pino-worker': import.meta
        .resolve('./pino-worker.js')
        .replace(/^file:\/\//, ''),
    },
  });
}

const m = await import('./main.ts');
await m.main();
