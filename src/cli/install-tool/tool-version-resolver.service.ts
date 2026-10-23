import { inject, injectable, multiInject } from 'inversify';
import { isReleaseVersion } from '../../../packages/base/src/release-version.ts';
import { DistroCode } from '../../../packages/base/src/schema.ts';
import type { ToolVersions } from '../../../packages/base/src/tool-versions-types.ts';
import { EnvService, ToolVersionsService } from '../services/index.ts';
import { getDistro, isValid, logger, semverGte } from '../utils/index.ts';
import {
  TOOL_VERSION_RESOLVER,
  type ToolVersionResolver,
  isPartialVersion,
} from './tool-version-resolver.ts';

/**
 * The architecture and the distro codename the tool is installed on, and the
 * running containerbase release version, `undefined` for a development build.
 */
interface Host {
  arch: string;
  distro: string;
  cb: string | undefined;
}

/**
 * The distros whose files a release needs to run on the host: the host distro
 * itself, or, when the data has no files for it on the host arch at all, any
 * older Ubuntu release, as the installers use those builds on newer releases,
 * like the jammy prebuilds on noble and resolute.
 * @returns the accepted distro codenames, none for an unknown distro
 */
function hostDistros(data: ToolVersions, host: Host): string[] {
  const { arch, distro } = host;
  if (
    data.versions.some(
      (v) =>
        v.distros?.includes(distro) && (!v.archs || v.archs.includes(arch)),
    )
  ) {
    return [distro];
  }
  // oldest first; Ubuntu only, other distro families like Debian need their own
  // ordering and builds. An unknown distro, eg. an unreadable os-release, gets
  // none, so only releases without a `distros` list match.
  const ubuntu: readonly string[] = DistroCode.options;
  return ubuntu.slice(0, ubuntu.indexOf(distro) + 1);
}

/**
 * Picks a release from the data, prereleases and releases which are not
 * available for the host are skipped. A release is available when it has no
 * `archs` or `distros` list, or the list has the host arch or a distro which
 * runs on the host (see {@link hostDistros}), and the
 * running containerbase version is not below the `cb` of the `minCb` ranges
 * which cover it. Unmet ranges are logged at debug level when they change the
 * result. A range covers its `version` and every version above it in the data,
 * prereleases count for the position, a range whose `version` is not listed is
 * ignored. A `cb` which is not valid semver is never met, a
 * development build (`cb` is `undefined`) skips none. The data lists the newest
 * release first, in the versioning of the tool. A missing version or `latest`
 * is the newest release, or the newest LTS release for a tool whose data has
 * LTS flags, even when none is available for the host, then there is no match.
 * A partial version, a major (`20`) or major.minor (`3.12`) one, is the newest
 * release of that line, unless it is a release itself, like `8.10`.
 * @returns `undefined` when no release matches
 */
function pick(
  tool: string,
  data: ToolVersions,
  version: string | undefined,
  host: Host,
): string | undefined {
  // the versions up to this index need a newer containerbase: a range which
  // isn't met covers all versions from its start up to the newest one
  let unmet = -1;
  const unmetCbs: string[] = [];
  if (host.cb !== undefined) {
    for (const range of data.minCb ?? []) {
      const start = data.versions.findIndex((v) => v.version === range.version);
      if (start >= 0 && !(isValid(range.cb) && semverGte(host.cb, range.cb))) {
        unmet = Math.max(unmet, start);
        unmetCbs.push(range.cb);
      }
    }
  }
  const stable = data.versions.filter((v) => !v.prerelease);
  const distros = hostDistros(data, host);
  const forHost = (list: typeof data.versions): typeof data.versions =>
    list.filter(
      (v) =>
        !v.prerelease &&
        (!v.archs || v.archs.includes(host.arch)) &&
        (!v.distros || v.distros.some((d) => distros.includes(d))),
    );

  /** Picks the requested release from the candidates, newest first. */
  const find = (releases: typeof data.versions): string | undefined => {
    if (version === undefined || version === 'latest') {
      // the LTS flags are read before the host filter (arch, distro and
      // containerbase version), so a tool with LTS releases never falls back
      // to a release which isn't an LTS one
      return (
        stable.some((v) => v.lts) ? releases.find((v) => v.lts) : releases[0]
      )?.version;
    }
    if (releases.some((v) => v.version === version)) {
      return version;
    }
    return releases.find((v) => v.version.startsWith(`${version}.`))?.version;
  };

  const picked = find(forHost(data.versions.slice(unmet + 1)));
  // log only when the unmet ranges change the result of this request
  if (unmetCbs.length && find(forHost(data.versions)) !== picked) {
    logger.debug(
      { tool, running: host.cb, needed: unmetCbs },
      'skipping the versions which need a newer containerbase',
    );
  }
  return picked;
}

@injectable()
export class ToolVersionResolverService {
  /**
   * Takes all registered tool version resolvers, the tool-versions data and
   * the env, for the host arch.
   */
  constructor(
    @multiInject(TOOL_VERSION_RESOLVER) private resolver: ToolVersionResolver[],
    @inject(ToolVersionsService) private toolVersions: ToolVersionsService,
    @inject(EnvService) private env: EnvService,
  ) {}

  /**
   * Resolves the version with the tool's resolver. A tool without a resolver
   * is resolved from the tool-versions data, and keeps its version when the
   * data can't answer.
   */
  async resolve(
    tool: string,
    version: string | undefined,
  ): Promise<string | undefined> {
    const resolver = this.resolver.find((r) => r.tool === tool);
    if (resolver) {
      return (await resolver.resolve(version)) ?? version;
    }
    return (await this.resolveFromData(tool, version)) ?? version;
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
   * Only releases available for the host arch and distro, and installable by
   * the running containerbase version (`minCb`), are considered, also for the
   * embedded release check. Only a release version of containerbase filters by
   * `minCb`, any other version, like `0.0.0-PLACEHOLDER`, is a development
   * build and doesn't.
   * @returns `undefined` when no data has a match
   */
  private async resolveFromData(
    tool: string,
    version: string | undefined,
  ): Promise<string | undefined> {
    const exact =
      version !== undefined &&
      version !== 'latest' &&
      !isPartialVersion(version);
    if (exact) {
      return undefined;
    }

    const host: Host = {
      arch: this.env.arch,
      distro: (await getDistro()).versionCode,
      cb: isReleaseVersion(this.env.version) ? this.env.version : undefined,
    };
    if (version !== undefined && version !== 'latest') {
      const listed = await this.toolVersions.getVersions(tool);
      if (listed && pick(tool, listed, version, host) === version) {
        logger.debug(
          { tool, version, resolved: version },
          'version resolved from the embedded tool-versions data',
        );
        return version;
      }
    }

    const online = await this.toolVersions.getOnlineVersions(tool);
    if (online) {
      const resolved = pick(tool, online, version, host);
      if (resolved !== undefined) {
        logger.debug(
          { tool, version, resolved },
          'version resolved from the online tool-versions data',
        );
      }
      return resolved;
    }

    const data = await this.toolVersions.getVersions(tool);
    const resolved = data && pick(tool, data, version, host);
    if (resolved !== undefined) {
      logger.warn(
        { tool, version, resolved },
        'online tool-versions data not available, using the embedded, possibly outdated data',
      );
    }
    return resolved;
  }
}
