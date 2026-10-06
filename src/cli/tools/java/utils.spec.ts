import fs from 'node:fs/promises';
import path from 'node:path';
import type { Container } from 'inversify';
import { beforeEach, describe, expect, test } from 'vitest';
import { HttpService, PathService } from '../../services/index.ts';
import { logger } from '../../utils/index.ts';
import {
  createGradleSettings,
  createMavenSettings,
  resolveJavaDownloadUrl,
  resolveLatestJavaVersion,
} from './utils.ts';
import { testContainer } from '~test/di.ts';
import { scope } from '~test/http-mock.ts';

const baseUrl = 'https://api.adoptium.net';

describe('cli/tools/java/utils', () => {
  let child!: Container;
  let http!: HttpService;
  let pathSvc!: PathService;

  beforeEach(async () => {
    child = await testContainer();
    http = await child.getAsync(HttpService);
    pathSvc = await child.getAsync(PathService);
  });

  test.each([
    { arch: 'amd64' as const, expected: 'x64' },
    { arch: 'arm64' as const, expected: 'aarch64' },
  ])('resolveLatestJavaVersion: lts $arch', async ({ arch, expected }) => {
    scope(baseUrl)
      .get('/v3/info/release_versions')
      .query(
        (q) =>
          q.architecture === expected &&
          q.image_type === 'jre' &&
          q.lts === 'true' &&
          q.semver === 'true' &&
          !('version' in q),
      )
      .reply(200, { versions: [{ semver: '21.0.4+7' }] });

    expect(await resolveLatestJavaVersion(http, 'jre', arch)).toBe('21.0.4+7');
  });

  test('resolveLatestJavaVersion: range', async () => {
    scope(baseUrl)
      .get('/v3/info/release_versions')
      .query(
        (q) =>
          q.architecture === 'x64' &&
          q.image_type === 'jdk' &&
          q.version === '[11,12)' &&
          !('lts' in q) &&
          !('semver' in q),
      )
      .reply(200, { versions: [{ semver: '11.0.32+101' }] });

    expect(
      await resolveLatestJavaVersion(http, 'jdk', 'amd64', '[11,12)'),
    ).toBe('11.0.32+101');
  });

  test('resolveLatestJavaVersion: empty versions', async () => {
    scope(baseUrl)
      .get('/v3/info/release_versions')
      .query(true)
      .reply(200, { versions: [] });

    expect(
      await resolveLatestJavaVersion(http, 'jdk', 'amd64', '[99,100)'),
    ).toBeUndefined();
  });

  test('resolveLatestJavaVersion: 404 is no version', async () => {
    scope(baseUrl)
      .get('/v3/info/release_versions')
      .query((q) => q.version === '[99,100)')
      .reply(404);

    expect(
      await resolveLatestJavaVersion(http, 'jdk', 'amd64', '[99,100)'),
    ).toBeUndefined();
  });

  test('resolveLatestJavaVersion: rethrows other errors', async () => {
    scope(baseUrl)
      .get('/v3/info/release_versions')
      .query(true)
      .times(3)
      .reply(501);

    await expect(
      resolveLatestJavaVersion(http, 'jdk', 'amd64', '[11,12)'),
    ).rejects.toThrow('download failed');
  });

  test('resolveJavaDownloadUrl', async () => {
    const pkg = {
      checksum: 'abc',
      link: 'https://example.com/jdk.tar.gz',
      name: 'jdk.tar.gz',
    };
    scope(baseUrl)
      .get('/v3/assets/version/21.0.4+7')
      .query((q) => q.architecture === 'x64' && q.image_type === 'jdk')
      .reply(200, [{ binaries: [{ package: pkg }] }]);

    expect(
      await resolveJavaDownloadUrl(http, 'jdk', 'amd64', '21.0.4+7'),
    ).toEqual(pkg);
  });

  test('resolveJavaDownloadUrl: no binaries', async () => {
    scope(baseUrl)
      .get('/v3/assets/version/21.0.4+7')
      .query(true)
      .reply(200, [{ binaries: [] }]);

    expect(
      await resolveJavaDownloadUrl(http, 'jdk', 'arm64', '21.0.4+7'),
    ).toBeUndefined();
  });

  test('createMavenSettings', async () => {
    const file = path.join(pathSvc.cachePath, '.m2', 'settings.xml');

    await expect(createMavenSettings(pathSvc)).resolves.toBeUndefined();
    expect(await fs.readFile(file, 'utf8')).toContain(
      '<settings xmlns="http://maven.apache.org/SETTINGS/1.0.0"',
    );
    expect(logger.debug).toHaveBeenCalledWith('Creating Maven settings');

    // keeps existing settings
    await fs.writeFile(file, 'custom');
    await expect(createMavenSettings(pathSvc)).resolves.toBeUndefined();
    expect(await fs.readFile(file, 'utf8')).toBe('custom');
    expect(logger.debug).toHaveBeenCalledWith('Maven settings already found');
  });

  test('createGradleSettings', async () => {
    const file = path.join(pathSvc.cachePath, '.gradle', 'gradle.properties');

    await expect(createGradleSettings(pathSvc)).resolves.toBeUndefined();
    expect(await fs.readFile(file, 'utf8')).toContain(
      'org.gradle.daemon=false',
    );
    expect(logger.debug).toHaveBeenCalledWith('Creating Gradle settings');

    // keeps existing settings
    await fs.writeFile(file, 'custom');
    await expect(createGradleSettings(pathSvc)).resolves.toBeUndefined();
    expect(await fs.readFile(file, 'utf8')).toBe('custom');
    expect(logger.debug).toHaveBeenCalledWith('Gradle settings already found');
  });
});
