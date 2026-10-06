import path from 'node:path';
import type { HttpService, PathService } from '../../services';
import {
  type Arch,
  fileContent,
  logger,
  pathExists,
} from '../../utils/index.ts';
import {
  type AdoptiumPackage,
  AdoptiumReleaseVersions,
  AdoptiumReleases,
} from './schema.ts';

/**
 * Resolves the newest adoptium ga version for the image type and architecture.
 * @param http - the http service
 * @param type - the image type
 * @param arch - the architecture
 * @param range - a maven version range to search in, like `[11,12)`; without it the newest lts is returned
 * @returns the semver of the newest version, or `undefined` when there is none
 */
export async function resolveLatestJavaVersion(
  http: HttpService,
  type: 'jre' | 'jdk',
  arch: Arch,
  range?: string,
): Promise<string | undefined> {
  const base_url = 'https://api.adoptium.net/v3/info/release_versions';
  const api_args =
    'heap_size=normal&os=linux&page=0&page_size=1&project=jdk&release_type=ga&sort_order=DESC';
  // adoptium rejects `semver=true` together with a version range
  const filter = range
    ? `version=${encodeURIComponent(range)}`
    : 'lts=true&semver=true';

  const res = AdoptiumReleaseVersions.parse(
    await http.getJson(
      `${base_url}?architecture=${arch === 'amd64' ? 'x64' : 'aarch64'}&image_type=${type}&${api_args}&${filter}`,
    ),
  );

  return res.versions[0]?.semver;
}

/** The adoptium package for the version, image type and architecture. */
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

/** Creates an empty maven `settings.xml` in the cache, unless there is one. */
export async function createMavenSettings(pathSvc: PathService): Promise<void> {
  const dir = path.join(pathSvc.cachePath, '.m2');
  await pathSvc.createDir(dir);

  const file = path.join(dir, 'settings.xml');
  if (await pathExists(file)) {
    logger.debug('Maven settings already found');
    return;
  }

  logger.debug('Creating Maven settings');
  await pathSvc.writeFile(
    file,
    fileContent`
      <settings xmlns="http://maven.apache.org/SETTINGS/1.0.0"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://maven.apache.org/SETTINGS/1.0.0
                            http://maven.apache.org/xsd/settings-1.0.0.xsd">

      </settings>
    `,
  );
}

/** Creates the gradle `gradle.properties` in the cache, unless there is one. */
export async function createGradleSettings(
  pathSvc: PathService,
): Promise<void> {
  const dir = path.join(pathSvc.cachePath, '.gradle');
  await pathSvc.createDir(dir);

  const file = path.join(dir, 'gradle.properties');
  if (await pathExists(file)) {
    logger.debug('Gradle settings already found');
    return;
  }

  logger.debug('Creating Gradle settings');
  await pathSvc.writeFile(
    file,
    fileContent`
      org.gradle.parallel=true
      org.gradle.configureondemand=true
      org.gradle.daemon=false
      org.gradle.caching=false
    `,
  );
}
