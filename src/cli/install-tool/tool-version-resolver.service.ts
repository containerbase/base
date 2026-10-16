import { inject, injectable, multiInject } from 'inversify';
import type { ToolVersions } from '../../../packages/base/src/tool-versions-types.ts';
import { ToolVersionsService } from '../services/index.ts';
import { logger } from '../utils/index.ts';
import {
  TOOL_VERSION_RESOLVER,
  type ToolVersionResolver,
  isPartialVersion,
  newestVersion,
} from './tool-version-resolver.ts';

/**
 * Resolves a partial version, a major (`20`) or major.minor (`3.12`) one, to
 * the newest release of that line. A version which is a release itself, like
 * `8.10`, stays as it is. Prereleases are skipped, the flag comes with the
 * data.
 * @returns `undefined` when no release matches
 */
function matchPartial(data: ToolVersions, version: string): string | undefined {
  const releases = data.versions.filter((v) => !v.prerelease);
  const names = releases.map((v) => v.version);
  if (names.includes(version)) {
    return version;
  }
  return newestVersion(names.filter((name) => name.startsWith(`${version}.`)));
}

@injectable()
export class ToolVersionResolverService {
  /** Takes all registered tool version resolvers and the embedded data. */
  constructor(
    @multiInject(TOOL_VERSION_RESOLVER) private resolver: ToolVersionResolver[],
    @inject(ToolVersionsService) private embedded: ToolVersionsService,
  ) {}

  /**
   * Resolves the version with the tool's resolver. A tool without a resolver
   * keeps its version, except for a partial one, which resolves from the
   * tool-versions data. An exact version the embedded data lists is
   * returned without the resolver, which keeps an exact version. When the
   * resolver fails, the embedded data is used too if it can answer, else the
   * error is thrown.
   */
  async resolve(
    tool: string,
    version: string | undefined,
  ): Promise<string | undefined> {
    const resolver = this.resolver.find((r) => r.tool === tool);
    if (!resolver) {
      return (await this.resolvePartial(tool, version)) ?? version;
    }

    if (
      version !== undefined &&
      version !== 'latest' &&
      !isPartialVersion(version)
    ) {
      const known = await this.resolveEmbedded(tool, version);
      if (known !== undefined) {
        logger.debug(
          { tool, version },
          'exact version resolved from the embedded tool-versions data',
        );
        return known;
      }
    }

    try {
      return (await resolver.resolve(version)) ?? version;
    } catch (err) {
      const resolved = await this.resolveEmbedded(tool, version);
      if (resolved === undefined) {
        throw err;
      }
      logger.warn(
        { tool, version, resolved, err },
        'version lookup failed, using the embedded tool-versions data',
      );
      return resolved;
    }
  }

  /**
   * Resolves a partial version of a tool without a resolver from the online
   * tool-versions data. The embedded data is only used when the online data
   * can't be loaded, as it may be outdated. Online data without a match is
   * final, the embedded data is older and can't know more.
   * @returns `undefined` for any other version, or when no data has a match
   */
  private async resolvePartial(
    tool: string,
    version: string | undefined,
  ): Promise<string | undefined> {
    if (version === undefined || !isPartialVersion(version)) {
      return undefined;
    }

    const online = await this.embedded.getOnlineVersions(tool);
    if (online) {
      return matchPartial(online, version);
    }

    const data = await this.embedded.getVersions(tool);
    const resolved = data && matchPartial(data, version);
    if (resolved !== undefined) {
      logger.warn(
        { tool, version, resolved },
        'online tool-versions data not available, using the embedded, possibly outdated data',
      );
    }
    return resolved;
  }

  /**
   * Resolves the version from the embedded data: a missing version or `latest`
   * to the newest LTS release, or the newest release for a tool without LTS
   * releases, a partial version to the newest release of its line, any other
   * version only when it is listed.
   * @returns `undefined` when the embedded data can't answer
   */
  private async resolveEmbedded(
    tool: string,
    version: string | undefined,
  ): Promise<string | undefined> {
    const data = await this.embedded.getVersions(tool);
    if (!data) {
      return undefined;
    }

    if (version === undefined || version === 'latest') {
      // newest first, only node and java have `lts` flags and their resolvers
      // pick the newest LTS too. A tool-level lts flag in the tool-versions
      // data will replace this inference later, see
      // https://github.com/containerbase/tool-versions/issues/150
      const releases = data.versions.filter((v) => !v.prerelease);
      return (releases.find((v) => v.lts) ?? releases[0])?.version;
    }
    if (isPartialVersion(version)) {
      return matchPartial(data, version);
    }
    return data.versions.find((v) => v.version === version)?.version;
  }
}
