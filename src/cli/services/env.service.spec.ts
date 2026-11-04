import { sep } from 'node:path';
import { env } from 'node:process';
import { Container } from 'inversify';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest';
import { logger, resetWarnings } from '../utils/index.ts';
import { EnvService } from './index.ts';
import { testContainer } from '~test/di.ts';
import { rootPath } from '~test/path.ts';

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

  /** Creates a fresh container and env service. */
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
    // the env warnings are logged once per process
    resetWarnings();
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

  test.each([
    [undefined, 0],
    ['1000', 1000],
  ])('primaryGroupId from %j', (value, expected) => {
    // `node:process` is mocked with a plain `env` object
    env.PRIMARY_GROUP_ID = value;
    try {
      expect(svc.primaryGroupId).toBe(expected);
    } finally {
      delete env.PRIMARY_GROUP_ID;
    }
  });

  test('umask', () => {
    expect(svc.umask).toBe(0o755);
    Object.assign(svc, { uid: 12021 });
    expect(svc.umask).toBe(0o775);
  });

  test('version', () => {
    vi.stubGlobal('CONTAINERBASE_VERSION', undefined);
    expect(svc.version).toBe('0.0.0-PLACEHOLDER');
    vi.stubGlobal('CONTAINERBASE_VERSION', '14.52.0');
    expect(svc.version).toBe('14.52.0');
    vi.unstubAllGlobals();
  });

  test('skipTests', () => {
    expect(svc.skipTests).toBe(false);
  });

  test('cacheDir', () => {
    delete env.CONTAINERBASE_CACHE_DIR;
    expect(svc.cacheDir).toBeNull();
  });

  test.each([
    { value: undefined, expected: 100 },
    { value: '', expected: 100 },
    { value: 'abc', expected: 100 },
    { value: '80', expected: 80 },
    { value: '0', expected: 0 },
  ])('maxAllocatedDisk: $value', ({ value, expected }) => {
    if (value === undefined) {
      delete env.CONTAINERBASE_MAX_ALLOCATED_DISK;
    } else {
      env.CONTAINERBASE_MAX_ALLOCATED_DISK = value;
    }
    try {
      expect(svc.maxAllocatedDisk).toBe(expected);
    } finally {
      delete env.CONTAINERBASE_MAX_ALLOCATED_DISK;
    }
  });

  test.each([
    { value: undefined, expected: false },
    { value: '', expected: false },
    { value: 'false', expected: false },
    { value: 'FALSE', expected: false },
    { value: 'true', expected: true },
    { value: 'True', expected: true },
  ])('resolverOffline: $value', ({ value, expected }) => {
    if (value === undefined) {
      delete env.CONTAINERBASE_RESOLVER_OFFLINE;
    } else {
      env.CONTAINERBASE_RESOLVER_OFFLINE = value;
    }
    try {
      expect(svc.resolverOffline).toBe(expected);
      expect(logger.warn).not.toHaveBeenCalled();
    } finally {
      delete env.CONTAINERBASE_RESOLVER_OFFLINE;
    }
  });

  test('resolverOffline warns about an invalid value once', () => {
    env.CONTAINERBASE_RESOLVER_OFFLINE = 'yes';
    try {
      expect(svc.resolverOffline).toBe(false);
      expect(svc.resolverOffline).toBe(false);
      expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
        { value: 'yes' },
        'Invalid CONTAINERBASE_RESOLVER_OFFLINE, use true or false',
      );
    } finally {
      delete env.CONTAINERBASE_RESOLVER_OFFLINE;
    }
  });

  test.each([
    { value: undefined, expected: 24 * 3_600_000 },
    { value: '', expected: 24 * 3_600_000 },
    { value: '2h', expected: 2 * 3_600_000 },
    { value: '1 day 2h', expected: 26 * 3_600_000 },
    // the parts are split case insensitive, `M` is a month like for Renovate
    { value: '1H 30MIN', expected: 90 * 60_000 },
    { value: '1 month', expected: 30 * 24 * 3_600_000 },
    // the month word in any case, a lowercase `m` is a minute
    { value: '1 Month', expected: 30 * 24 * 3_600_000 },
    { value: '2 MONTHS', expected: 60 * 24 * 3_600_000 },
    { value: '2M', expected: 60 * 24 * 3_600_000 },
    { value: '2m', expected: 2 * 60_000 },
  ])('resolverMaxAge: $value', ({ value, expected }) => {
    if (value === undefined) {
      delete env.CONTAINERBASE_RESOLVER_MAX_AGE;
    } else {
      env.CONTAINERBASE_RESOLVER_MAX_AGE = value;
    }
    try {
      expect(svc.resolverMaxAge).toBe(expected);
      expect(logger.warn).not.toHaveBeenCalled();
    } finally {
      delete env.CONTAINERBASE_RESOLVER_MAX_AGE;
    }
  });

  test.each(['soon', '  ', '-1h', '1h -2h', '2h -1h'])(
    'resolverMaxAge warns about the invalid value %j once and uses the default',
    (value) => {
      env.CONTAINERBASE_RESOLVER_MAX_AGE = value;
      try {
        expect(svc.resolverMaxAge).toBe(24 * 3_600_000);
        expect(svc.resolverMaxAge).toBe(24 * 3_600_000);
        expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
          { value },
          'Invalid CONTAINERBASE_RESOLVER_MAX_AGE, using the default of 24 hours',
        );
      } finally {
        delete env.CONTAINERBASE_RESOLVER_MAX_AGE;
      }
    },
  );

  test.each([
    // a plain number is milliseconds, like for Renovate
    { value: '24', expected: 24 },
    // also a part of a compound value
    { value: '1h30', expected: 3_600_000 + 30 },
  ])(
    'resolverMaxAge warns once that a part of $value without a unit is milliseconds',
    ({ value, expected }) => {
      env.CONTAINERBASE_RESOLVER_MAX_AGE = value;
      try {
        expect(svc.resolverMaxAge).toBe(expected);
        expect(svc.resolverMaxAge).toBe(expected);
        expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
          { value },
          'CONTAINERBASE_RESOLVER_MAX_AGE has a number without a unit, it is read as milliseconds',
        );
      } finally {
        delete env.CONTAINERBASE_RESOLVER_MAX_AGE;
      }
    },
  );

  describe('containerbaseTmpDir', () => {
    // `node:process` is mocked with a plain `env` object, which `vi.stubEnv` doesn't reach
    afterEach(() => {
      delete env.CONTAINERBASE_TMP_DIR;
    });

    test('defaults to tmp/containerbase', () => {
      expect(svc.containerbaseTmpDir).toBe(rootPath('tmp/containerbase'));
      expect(svc.defaultContainerbaseTmpDir).toBe(
        rootPath('tmp/containerbase'),
      );
    });

    test('uses the default for an empty CONTAINERBASE_TMP_DIR', () => {
      env.CONTAINERBASE_TMP_DIR = '';
      expect(svc.containerbaseTmpDir).toBe(rootPath('tmp/containerbase'));
    });

    test('uses CONTAINERBASE_TMP_DIR', () => {
      env.CONTAINERBASE_TMP_DIR = '/var/cache/containerbase';
      expect(svc.containerbaseTmpDir).toBe('/var/cache/containerbase');
    });

    test('ignores a relative CONTAINERBASE_TMP_DIR with a single warning', () => {
      env.CONTAINERBASE_TMP_DIR = 'var/cache/containerbase';
      expect(svc.containerbaseTmpDir).toBe(rootPath('tmp/containerbase'));
      expect(svc.containerbaseTmpDir).toBe(rootPath('tmp/containerbase'));
      expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
        { dir: 'var/cache/containerbase' },
        'Ignoring invalid CONTAINERBASE_TMP_DIR, using the default',
      );
    });

    test('drops trailing slashes', () => {
      env.CONTAINERBASE_TMP_DIR = '/var/cache/containerbase//';
      expect(svc.containerbaseTmpDir).toBe('/var/cache/containerbase');
    });

    test.each([
      ['/var/cache/containerbase//', '/var/cache/containerbase'],
      ['var/cache/containerbase', undefined],
      [undefined, undefined],
    ])('exports %s for child processes', (value, normalized) => {
      const expected = normalized ?? rootPath('tmp/containerbase');
      if (value) {
        env.CONTAINERBASE_TMP_DIR = value;
      }
      expect(svc.containerbaseTmpDir).toBe(expected);
      expect(env.CONTAINERBASE_TMP_DIR).toBe(expected);
    });

    test.each(['/', '//'])('ignores %s with a warning', (dir) => {
      env.CONTAINERBASE_TMP_DIR = dir;
      expect(svc.containerbaseTmpDir).toBe(rootPath('tmp/containerbase'));
      expect(svc.containerbaseTmpDir).toBe(rootPath('tmp/containerbase'));
      expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
        { dir },
        'Ignoring invalid CONTAINERBASE_TMP_DIR, using the default',
      );
      expect(env.CONTAINERBASE_TMP_DIR).toBe(rootPath('tmp/containerbase'));
    });

    test('uses the default folder without a warning', () => {
      env.CONTAINERBASE_TMP_DIR = rootPath('tmp/containerbase');
      expect(svc.containerbaseTmpDir).toBe(rootPath('tmp/containerbase'));
      expect(logger.warn).not.toHaveBeenCalled();
    });

    test.each([
      'tmp',
      'tmp/containerbase/persist',
      'tmp/containerbase-persist',
      'tmp/other',
    ])('ignores %s below the temp folder with a warning', (path) => {
      const dir = rootPath(path);
      env.CONTAINERBASE_TMP_DIR = dir;
      expect(svc.containerbaseTmpDir).toBe(rootPath('tmp/containerbase'));
      expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
        { dir },
        'Ignoring invalid CONTAINERBASE_TMP_DIR, using the default',
      );
    });

    test.each([
      '/var//cache',
      '/var/./cache',
      '/var/../cache',
      '/var/cache/.',
      '/var/cache/..',
    ])('ignores the not normalized %s with a warning', (dir) => {
      env.CONTAINERBASE_TMP_DIR = dir;
      expect(svc.containerbaseTmpDir).toBe(rootPath('tmp/containerbase'));
      expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
        { dir },
        'Ignoring invalid CONTAINERBASE_TMP_DIR, using the default',
      );
    });
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
