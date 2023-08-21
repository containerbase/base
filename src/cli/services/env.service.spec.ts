import { sep } from 'node:path';
import { env } from 'node:process';
import type { Container } from 'inversify';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { EnvService, rootContainer } from '.';
import { rootFile } from '~test/path';

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
    expect(child.get(EnvService).userHome).toBe(rootFile('home/ubuntu'));
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
      expect(e.rootDir).toBe(rootFile());
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
});
