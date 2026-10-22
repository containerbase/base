import { inject, injectable, multiInject } from 'inversify';
import type { ToolVersions } from '../../../packages/base/src/tool-versions-types.ts';
import { ToolVersionsService } from '../services/index.ts';
import { logger } from '../utils/index.ts';
import {
  TOOL_VERSION_RESOLVER,
  type ToolVersionResolver,
  isPartialVersion,
} from './tool-version-resolver.ts';

/** Tells whether the install service of a tool can install a version. */
export type IsInstallable = (version: string) => boolean | Promise<boolean>;

/**
 * Looks up the check of a tool for installable versions, lazily as it may need
 * the install services.
 * @returns `undefined` for a tool whose versions are not checked
 */
export type InstallableLookup = (
  tool: string,
) => Promise<IsInstallable | undefined>;

/**
 * Finds the first release the predicate accepts, in the order of the data.
 * @returns `undefined` when no release is accepted
 */
async function findInstallable(
  releases: ToolVersions['versions'],
  isInstallable: IsInstallable,
  accepts: (release: ToolVersions['versions'][number]) => boolean,
): Promise<string | undefined> {
  for (const release of releases) {
    if (accepts(release) && (await isInstallable(release.version))) {
      return release.version;
    }
  }
  return undefined;
}

/**
 * Picks a release from the data, prereleases and releases which are not
 * installable are skipped. The data lists the newest release first, in the
 * versioning of the tool. A missing version or `latest` is the newest release,
 * or the newest LTS release for a tool whose data has LTS flags. A partial
 * version, a major (`20`) or major.minor (`3.12`) one, is the newest release
 * of that line, unless it is a release itself, like `8.10`.
 * @returns `undefined` when no release matches
 */
async function pick(
  data: ToolVersions,
  version: string | undefined,
  isInstallable: IsInstallable,
): Promise<string | undefined> {
  const releases = data.versions.filter((v) => !v.prerelease);
  if (version === undefined || version === 'latest') {
    return (
      (await findInstallable(releases, isInstallable, (v) => !!v.lts)) ??
      (await findInstallable(releases, isInstallable, () => true))
    );
  }

  return (
    (await findInstallable(
      releases,
      isInstallable,
      (v) => v.version === version,
    )) ??
    (await findInstallable(releases, isInstallable, (v) =>
      v.version.startsWith(`${version}.`),
    ))
  );
}

@injectable()
export class ToolVersionResolverService {
  /** Takes all registered tool version resolvers and the tool-versions data. */
  constructor(
    @multiInject(TOOL_VERSION_RESOLVER) private resolver: ToolVersionResolver[],
    @inject(ToolVersionsService) private toolVersions: ToolVersionsService,
  ) {}

  /**
   * Resolves the version with the tool's resolver. A tool without a resolver
   * is resolved from the tool-versions data, and keeps its version when the
   * data can't answer.
   * @param findInstallable - looks up the check for installable versions of a
   * tool resolved from the data, without one all versions are accepted
   */
  async resolve(
    tool: string,
    version: string | undefined,
    findInstallable?: InstallableLookup,
  ): Promise<string | undefined> {
    const resolver = this.resolver.find((r) => r.tool === tool);
    if (resolver) {
      return (await resolver.resolve(version)) ?? version;
    }
    return (
      (await this.resolveFromData(tool, version, findInstallable)) ?? version
    );
  }

  /**
   * Resolves a missing version, `latest` or a partial version from the online
   * tool-versions data, any other version is not checked. A partial version
   * which the embedded data lists as a release, like `8.10`, is kept without
   * the online lookup, so it doesn't wait for a timeout when offline. The
   * embedded data is otherwise only used when the online data can't be loaded,
   * as it may be outdated. Online data without a match is final, the embedded
   * data is older and can't know more. A resolved version is logged at debug
   * level, or with a warning when the embedded data replaces the online data.
   * Releases the install service of the tool can't install are skipped, and
   * logged at debug level.
   * @returns `undefined` when no data has a match
   */
  private async resolveFromData(
    tool: string,
    version: string | undefined,
    findInstallable: InstallableLookup | undefined,
  ): Promise<string | undefined> {
    const isConcrete = version !== undefined && version !== 'latest';
    if (isConcrete && !isPartialVersion(version)) {
      return undefined;
    }

    const check = await findInstallable?.(tool);
    const isInstallable: IsInstallable = async (release) => {
      const installable = !check || (await check(release));
      if (!installable) {
        logger.debug(
          { tool, version: release },
          'release skipped, not installable',
        );
      }
      return installable;
    };

    if (isConcrete) {
      const listed = await this.toolVersions.getVersions(tool);
      if (listed && (await pick(listed, version, isInstallable)) === version) {
        logger.debug(
          { tool, version, resolved: version },
          'version resolved from the embedded tool-versions data',
        );
        return version;
      }
    }

    const online = await this.toolVersions.getOnlineVersions(tool);
    if (online) {
      const resolved = await pick(online, version, isInstallable);
      if (resolved !== undefined) {
        logger.debug(
          { tool, version, resolved },
          'version resolved from the online tool-versions data',
        );
      }
      return resolved;
    }

    const data = await this.toolVersions.getVersions(tool);
    const resolved = data && (await pick(data, version, isInstallable));
    if (resolved !== undefined) {
      logger.warn(
        { tool, version, resolved },
        'online tool-versions data not available, using the embedded, possibly outdated data',
      );
    }
    return resolved;
  }
}
