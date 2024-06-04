import fs from 'node:fs/promises';
import path from 'node:path';
import { codeBlock } from 'common-tags';
import { execa } from 'execa';
import type { HttpService } from '../../services';
import { type Arch, fileExists, logger } from '../../utils';
import {
  type AdoptiumPackage,
  AdoptiumReleaseVersions,
  AdoptiumReleases,
} from './schema';

export async function resolveLatestJavaLtsVersion(
  http: HttpService,
  type: 'jre' | 'jdk',
  arch: Arch,
): Promise<string> {
  const base_url = 'https://api.adoptium.net/v3/info/release_versions';
  const api_args =
    'heap_size=normal&os=linux&page=0&page_size=1&project=jdk&release_type=ga&lts=true&semver=true';

  const res = AdoptiumReleaseVersions.parse(
    await http.getJson(
      `${base_url}?architecture=${arch === 'amd64' ? 'x64' : 'aarch64'}&image_type=${type}&${api_args}`,
    ),
  );

  return res.versions[0]!.semver;
}

export async function resolveJavaDownloadUrl(
  http: HttpService,
  type: 'jre' | 'jdk',
  arch: Arch,
  version: string,
): Promise<AdoptiumPackage | undefined> {
  const base_url = 'https://api.adoptium.net/v3/assets/version';
  const api_args =
    'heap_size=normal&os=linux&page=0&page_size=1&project=jdk&semver=true';

  const res = AdoptiumReleases.parse(
    await http.getJson(
      `${base_url}/${version}?architecture=${arch === 'amd64' ? 'x64' : 'aarch64'}&image_type=${type}&${api_args}`,
    ),
  );

  return res?.[0]?.binaries?.[0]?.package;
}

export async function createMavenSettings(
  home: string,
  userId: number,
): Promise<void> {
  const dir = path.join(home, '.m2');
  const file = path.join(dir, 'settings.xml');
  if (await fileExists(file)) {
    logger.debug('Maven settings already found');
    return;
  }
  logger.debug('Creating Maven settings');

  await fs.mkdir(dir);

  await fs.writeFile(
    file,
    codeBlock`
      <settings xmlns="http://maven.apache.org/SETTINGS/1.0.0"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://maven.apache.org/SETTINGS/1.0.0
                            http://maven.apache.org/xsd/settings-1.0.0.xsd">

      </settings>
    `,
  );

  // fs isn't recursive, so we use system binaries
  await execa('chown', ['-R', `${userId}`, dir]);
  await execa('chmod', ['-R', 'g+w', dir]);
}

export async function createGradleSettings(
  home: string,
  userId: number,
): Promise<void> {
  const dir = path.join(home, '.gradle');
  const file = path.join(dir, 'gradle.properties');
  if (await fileExists(file)) {
    logger.debug('Gradle settings already found');
    return;
  }
  logger.debug('Creating Gradle settings');

  await fs.mkdir(dir);

  await fs.writeFile(
    file,
    codeBlock`
      org.gradle.parallel=true
      org.gradle.configureondemand=true
      org.gradle.daemon=false
      org.gradle.caching=false
    `,
  );

  // fs isn't recursive, so we use system binaries
  await execa('chown', ['-R', `${userId}`, dir]);
  await execa('chmod', ['-R', 'g+w', dir]);
}
