import { env } from 'node:process';
import { createGlobalProxyAgent } from 'global-agent';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { bootstrap } from './proxy.ts';

vi.mock('global-agent', () => ({ createGlobalProxyAgent: vi.fn() }));

describe('cli/proxy', () => {
  const httpProxy = 'http://example.org/http-proxy';
  const httpsProxy = 'http://example.org/https-proxy';
  const noProxy = 'http://example.org/no-proxy';

  beforeEach(() => {
    vi.stubEnv('HTTP_PROXY', undefined);
    vi.stubEnv('http_proxy', undefined);
    vi.stubEnv('HTTPS_PROXY', undefined);
    vi.stubEnv('https_proxy', undefined);
    vi.stubEnv('NO_PROXY', undefined);
    vi.stubEnv('no_proxy', undefined);
  });

  test('respects HTTP_PROXY', () => {
    vi.stubEnv('HTTP_PROXY', httpProxy);
    bootstrap();
    expect(createGlobalProxyAgent).toHaveBeenCalledWith({
      environmentVariableNamespace: '',
    });
  });

  test('copies upper case HTTP_PROXY to http_proxy', () => {
    vi.stubEnv('HTTP_PROXY', httpProxy);
    bootstrap();
    expect(env.HTTP_PROXY).toBeDefined();
    expect(env.http_proxy).toBeDefined();

    expect(env.HTTPS_PROXY).toBeUndefined();
    expect(env.https_proxy).toBeUndefined();
    expect(env.NO_PROXY).toBeUndefined();
    expect(env.no_proxy).toBeUndefined();
    expect(createGlobalProxyAgent).toHaveBeenCalledWith({
      environmentVariableNamespace: '',
    });
  });

  test('respects HTTPS_PROXY', () => {
    vi.stubEnv('HTTPS_PROXY', httpsProxy);
    bootstrap();
    expect(createGlobalProxyAgent).toHaveBeenCalledWith({
      environmentVariableNamespace: '',
    });
  });

  test('copies upper case HTTPS_PROXY to https_proxy', () => {
    vi.stubEnv('HTTPS_PROXY', httpsProxy);
    bootstrap();
    expect(env.HTTPS_PROXY).toBeDefined();
    expect(env.https_proxy).toBeDefined();

    expect(env.HTTP_PROXY).toBeUndefined();
    expect(env.http_proxy).toBeUndefined();
    expect(env.NO_PROXY).toBeUndefined();
    expect(env.no_proxy).toBeUndefined();
    expect(createGlobalProxyAgent).toHaveBeenCalledWith({
      environmentVariableNamespace: '',
    });
  });

  test('does nothing', () => {
    vi.stubEnv('no_proxy', noProxy);
    bootstrap();
    expect(createGlobalProxyAgent).not.toHaveBeenCalled();
  });
});
