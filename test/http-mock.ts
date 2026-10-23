import type { Url } from 'node:url';
import nock from 'nock'; // eslint-disable-line no-restricted-imports
import { afterAll, afterEach, beforeAll } from 'vitest';

type BasePath = string | RegExp | Url;
let missingLog: string[] = [];
/** The hosts of the current test which may use the real network. */
const netHosts = new Set<string>();

interface TestRequest {
  method: string;
  href: string;
}

function onMissing(req: TestRequest, opts?: TestRequest): void {
  const { method, href } = opts ?? req;
  if (netHosts.has(new URL(href).hostname)) {
    return;
  }
  missingLog.push(`  ${method} ${href}`);
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

/**
 * Lets the requests to a host through to the real network until the end of
 * the test, eg. to a local server.
 * @param host - the hostname, without a port
 */
export function allowNetConnect(host: string): void {
  netHosts.add(host);
  nock.enableNetConnect((h) => netHosts.has(h.split(':')[0]!));
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
  netHosts.clear();
  nock.disableNetConnect();
  clear();
});
