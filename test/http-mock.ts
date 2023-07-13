import type { Url } from 'node:url';
import nock from 'nock'; // eslint-disable-line no-restricted-imports
import { afterAll, afterEach, beforeAll } from 'vitest';

type BasePath = string | RegExp | Url;
let missingLog: string[] = [];

type TestRequest = {
  method: string;
  href: string;
};

function onMissing(req: TestRequest, opts?: TestRequest): void {
  if (opts) {
    missingLog.push(`  ${opts.method} ${opts.href}`);
  } else {
    missingLog.push(`  ${req.method} ${req.href}`);
  }
}

/**
 *  Clear nock state. Will be called in `afterEach`
 *  @argument throwOnPending Use `false` to simply clear mocks.
 */
export function clear(throwOnPending = true): void {
  const isDone = nock.isDone();
  const pending = nock.pendingMocks();
  nock.abortPendingRequests();
  nock.cleanAll();
  const missing = missingLog;
  missingLog = [];
  if (missing.length && throwOnPending) {
    throw new Error(`Missing mocks!\n * ${missing.join('\n * ')}`);
  }
  if (!isDone && throwOnPending) {
    throw new Error(`Pending mocks!\n * ${pending.join('\n * ')}`);
  }
}

export function scope(basePath: BasePath, options?: nock.Options): nock.Scope {
  return nock(basePath, options);
}

// init nock
beforeAll(() => {
  nock.emitter.on('no match', onMissing);
  nock.disableNetConnect();
});

// clean nock to clear memory leack from http module patching
afterAll(() => {
  nock.emitter.removeListener('no match', onMissing);
  nock.restore();
});

// clear nock state
afterEach(() => {
  clear();
});
