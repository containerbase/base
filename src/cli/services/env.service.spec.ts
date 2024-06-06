import { sep } from 'node:path';
import { env } from 'node:process';
import type { Container } from 'inversify';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { EnvService, rootContainer } from '.';
import { rootPath } from '~test/path';

const mocks = vi.hoisted(() => ({ arch: vi.fn() }));

vi.mock('node:os', () => ({
  arch: mocks.arch,
}));

vi.mock('node:process', () => ({
  env: {},
  geteuid: undefined,
}));

describe('env.service', () => {
  let child!: Container;

  beforeEach(() => {
    child = rootContainer.createChild();
    env.CONTAINERBASE_ROOT_DIR = globalThis.rootDir;
    mocks.arch.mockReturnValue('x64');
  });

  test('arch', () => {
    mocks.arch.mockReturnValue('arm64');
    expect(child.get(EnvService).arch).toBe('arm64');

    mocks.arch.mockReturnValue('x64');
    expect(child.get(EnvService).arch).toBe('amd64');

    mocks.arch.mockReturnValue('invalid');
    expect(() => child.get(EnvService).arch).toThrow();
  });

  test('isRoot', () => {
    expect(child.get(EnvService).isRoot).toBe(true);
  });

  test('home', () => {
    expect(child.get(EnvService).home).toBeUndefined();
  });

  test('userHome', () => {
    expect(child.get(EnvService).userHome).toBe(rootPath('home/ubuntu'));
  });

  test('userId', () => {
    expect(child.get(EnvService).userId).toBe(1000);
  });

  test('umask', () => {
    const e = child.get(EnvService);
    expect(e.umask).toBe(0o755);
    Object.assign(e, { uid: 1000 });
    expect(e.umask).toBe(0o775);
  });

  test('skipTests', () => {
    expect(child.get(EnvService).skipTests).toBe(false);
  });

  test('cacheDir', () => {
    delete env.CONTAINERBASE_CACHE_DIR;
    expect(child.get(EnvService).cacheDir).toBeNull();
  });

  describe('rootDir', () => {
    test('uses test root', () => {
      const e = child.get(EnvService);
      expect(e.rootDir).toBe(rootPath());
    });

    test('uses default root', () => {
      delete env.CONTAINERBASE_ROOT_DIR;
      const e = child.get(EnvService);
      expect(e.rootDir).toBe(sep);
    });
  });

  test('isToolIgnored', () => {
    let e = child.get(EnvService);
    expect(e.isToolIgnored('npm')).toBe(false);
    expect(e.isToolIgnored('node')).toBe(false);

    env.IGNORED_TOOLS = 'npm,yarn';
    e = child.get(EnvService);
    expect(e.isToolIgnored('npm')).toBe(true);
    expect(e.isToolIgnored('node')).toBe(false);
  });

  test('replaceUrl', () => {
    const e = child.get(EnvService);
    env.URL_REPLACE_0_FROM = 'https://example.com';
    env.URL_REPLACE_0_TO = 'https://example.test';
    env.URL_REPLACE_1_FROM = 'https://cdn.example.com/registry.npmjs.org';
    env.URL_REPLACE_1_TO = 'https://npm.example.test';

    expect(e.replaceUrl('https://example.com/file.txt')).toBe(
      'https://example.test/file.txt',
    );
    expect(e.replaceUrl('https://example.org/file.txt')).toBe(
      'https://example.org/file.txt',
    );

    env.CONTAINERBASE_CDN = `https://cdn.example.com/`;
    expect(e.replaceUrl('https://localhost')).toBe(
      'https://cdn.example.com/localhost',
    );
    expect(e.replaceUrl('https://example.test/file.txt')).toBe(
      'https://cdn.example.com/example.test/file.txt',
    );
    expect(e.replaceUrl('https://registry.npmjs.org')).toBe(
      'https://npm.example.test',
    );
    expect(e.replaceUrl('https://registry.npmjs.org', false)).toBe(
      'https://registry.npmjs.org',
    );
  });
});
