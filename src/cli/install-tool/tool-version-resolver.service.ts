import { inject, injectable, multiInject } from 'inversify';
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
 * running containerbase version, `dev` for a local build.
 */
interface Host {
  arch: string;
  distro: string;
  cb: string;
}

/**
 * Picks a release from the data, prereleases and releases which are not
 * available for the host are skipped. A release is available when it has no
 * `archs` or `distros` list, or the list has the host arch or distro, and its
 * `minCb` is not above the running containerbase version. A `minCb` which is
 * not valid semver is never available, a `dev` build skips none. The data
 * lists the newest release first, in the versioning of the tool. A missing
 * version or `latest` is the newest release, or the newest LTS release for a
 * tool whose data has LTS flags, even when none is available for the host, then
 * there is no match. A partial version, a major (`20`) or major.minor (`3.12`)
 * one, is the newest release of that line, unless it is a release itself, like
 * `8.10`.
 * @returns `undefined` when no release matches
 */
function pick(
  data: ToolVersions,
  version: string | undefined,
  host: Host,
): string | undefined {
  const stable = data.versions.filter((v) => !v.prerelease);
  const releases = stable.filter(
    (v) =>
      (!v.archs || v.archs.includes(host.arch)) &&
      (!v.distros || v.distros.includes(host.distro)) &&
      (host.cb === 'dev' ||
        v.minCb === undefined ||
        (isValid(v.minCb) && semverGte(host.cb, v.minCb))),
  );
  if (version === undefined || version === 'latest') {
    // the LTS flags are read before the host filter (arch, distro and
    // containerbase version), so a tool with LTS releases never falls back to
    // a release which isn't an LTS one
    return (
      stable.some((v) => v.lts) ? releases.find((v) => v.lts) : releases[0]
    )?.version;
  }

  if (releases.some((v) => v.version === version)) {
    return version;
  }
  return releases.find((v) => v.version.startsWith(`${version}.`))?.version;
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
   * embedded release check.
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
      cb: this.env.version,
    };
    if (version !== undefined && version !== 'latest') {
      const listed = await this.toolVersions.getVersions(tool);
      if (listed && pick(listed, version, host) === version) {
        logger.debug(
          { tool, version, resolved: version },
          'version resolved from the embedded tool-versions data',
        );
        return version;
      }
    }

    const online = await this.toolVersions.getOnlineVersions(tool);
    if (online) {
      const resolved = pick(online, version, host);
      if (resolved !== undefined) {
        logger.debug(
          { tool, version, resolved },
          'version resolved from the online tool-versions data',
        );
      }
      return resolved;
    }

    const data = await this.toolVersions.getVersions(tool);
    const resolved = data && pick(data, version, host);
    if (resolved !== undefined) {
      logger.warn(
        { tool, version, resolved },
        'online tool-versions data not available, using the embedded, possibly outdated data',
      );
    }
    return resolved;
  }
}
