import { env } from 'node:process';
import { createGlobalProxyAgent } from 'global-agent';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { bootstrap, hasProxy } from './proxy';

vi.mock('global-agent', () => ({ createGlobalProxyAgent: vi.fn() }));

describe('proxy', () => {
  const httpProxy = 'http://example.org/http-proxy';
  const httpsProxy = 'http://example.org/https-proxy';
  const noProxy = 'http://example.org/no-proxy';

  beforeEach(() => {
    delete env.HTTP_PROXY;
    delete env.http_proxy;
    delete env.HTTPS_PROXY;
    delete env.https_proxy;
    delete env.NO_PROXY;
    delete env.no_proxy;
  });

  test('respects HTTP_PROXY', () => {
    env.HTTP_PROXY = httpProxy;
    bootstrap();
    expect(hasProxy()).toBe(true);
    expect(createGlobalProxyAgent).toHaveBeenCalledWith({
      environmentVariableNamespace: '',
    });
  });

  test('copies upper case HTTP_PROXY to http_proxy', () => {
    env.HTTP_PROXY = httpProxy;
    bootstrap();
    expect(hasProxy()).toBe(true);
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
    env.HTTPS_PROXY = httpsProxy;
    bootstrap();
    expect(hasProxy()).toBe(true);
    expect(createGlobalProxyAgent).toHaveBeenCalledWith({
      environmentVariableNamespace: '',
    });
  });

  test('copies upper case HTTPS_PROXY to https_proxy', () => {
    env.HTTPS_PROXY = httpsProxy;
    bootstrap();
    expect(hasProxy()).toBe(true);
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
    env.no_proxy = noProxy;
    bootstrap();
    expect(hasProxy()).toBe(false);
    expect(createGlobalProxyAgent).not.toHaveBeenCalled();
  });
});
