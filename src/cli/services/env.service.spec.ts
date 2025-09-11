import { sep } from 'node:path';
import { env } from 'node:process';
import { Container } from 'inversify';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { EnvService } from '.';
import { testContainer } from '~test/di';
import { rootPath } from '~test/path';

const mocks = vi.hoisted(() => ({ arch: vi.fn() }));

vi.mock('node:os', () => ({
  arch: mocks.arch,
}));

vi.mock('node:process', () => ({
  env: {},
  geteuid: undefined,
}));

describe('cli/services/env.service', () => {
  let child!: Container;
  let rootDir: string | undefined;
  let svc!: EnvService;

  async function init() {
    child = await testContainer();
    svc = await child.getAsync(EnvService);
  }

  beforeAll(() => {
    rootDir = globalThis.rootDir;
  });

  beforeEach(async () => {
    globalThis.rootDir = rootDir;
    mocks.arch.mockReturnValue('x64');
    await init();
  });

  test('arch', async () => {
    expect(svc.arch).toBe('amd64');

    mocks.arch.mockReturnValue('arm64');
    await init();
    expect(svc.arch).toBe('arm64');

    mocks.arch.mockReturnValue('invalid');
    await expect(init()).rejects.toThrow();
  });

  test('isRoot', () => {
    expect(svc.isRoot).toBe(true);
  });

  test('home', () => {
    expect(svc.home).toBeUndefined();
  });

  test('rootHome', () => {
    expect(svc.rootHome).toBe(rootPath('root'));
  });

  test('userHome', () => {
    expect(svc.userHome).toBe(rootPath('home/ubuntu'));
  });

  test('userId', () => {
    expect(svc.userId).toBe(12021);
  });

  test('umask', () => {
    expect(svc.umask).toBe(0o755);
    Object.assign(svc, { uid: 12021 });
    expect(svc.umask).toBe(0o775);
  });

  test('skipTests', () => {
    expect(svc.skipTests).toBe(false);
  });

  test('cacheDir', () => {
    delete env.CONTAINERBASE_CACHE_DIR;
    expect(svc.cacheDir).toBeNull();
  });

  describe('rootDir', () => {
    test('uses test root', () => {
      expect(svc.rootDir).toBe(rootPath());
    });

    test('uses default root', () => {
      globalThis.rootDir = undefined;
      expect(svc.rootDir).toBe(sep);
    });
  });

  test('isToolIgnored', async () => {
    expect(svc.isToolIgnored('npm')).toBe(false);
    expect(svc.isToolIgnored('node')).toBe(false);

    env.IGNORED_TOOLS = 'npm,yarn';
    await init();
    expect(svc.isToolIgnored('npm')).toBe(true);
    expect(svc.isToolIgnored('node')).toBe(false);
  });

  test('replaceUrl', () => {
    env.URL_REPLACE_0_FROM = 'https://example.com';
    env.URL_REPLACE_0_TO = 'https://example.test';
    env.URL_REPLACE_1_FROM = 'https://cdn.example.com/registry.npmjs.org';
    env.URL_REPLACE_1_TO = 'https://npm.example.test';

    expect(svc.replaceUrl('https://example.com/file.txt')).toBe(
      'https://example.test/file.txt',
    );
    expect(svc.replaceUrl('https://example.org/file.txt')).toBe(
      'https://example.org/file.txt',
    );

    env.CONTAINERBASE_CDN = `https://cdn.example.com/`;
    expect(svc.replaceUrl('https://localhost')).toBe(
      'https://cdn.example.com/localhost',
    );
    expect(svc.replaceUrl('https://example.test/file.txt')).toBe(
      'https://cdn.example.com/example.test/file.txt',
    );
    expect(svc.replaceUrl('https://registry.npmjs.org')).toBe(
      'https://npm.example.test',
    );
    expect(svc.replaceUrl('https://registry.npmjs.org', false)).toBe(
      'https://registry.npmjs.org',
    );
  });
});
