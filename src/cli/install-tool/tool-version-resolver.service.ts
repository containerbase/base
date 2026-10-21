import { inject, injectable, multiInject } from 'inversify';
import type { ToolVersions } from '../../../packages/base/src/tool-versions-types.ts';
import { ToolVersionsService } from '../services/index.ts';
import { logger } from '../utils/index.ts';
import {
  TOOL_VERSION_RESOLVER,
  type ToolVersionResolver,
  isPartialVersion,
} from './tool-version-resolver.ts';

/**
 * Picks a release from the data, prereleases are skipped. The data lists the
 * newest release first, in the versioning of the tool. A missing version or
 * `latest` is the newest release, or the newest LTS release for a tool whose
 * data has LTS flags. A partial version, a major (`20`) or major.minor (`3.12`)
 * one, is the newest release of that line, unless it is a release itself, like
 * `8.10`.
 * @returns `undefined` when no release matches
 */
function pick(
  data: ToolVersions,
  version: string | undefined,
): string | undefined {
  const releases = data.versions.filter((v) => !v.prerelease);
  if (version === undefined || version === 'latest') {
    return (releases.find((v) => v.lts) ?? releases[0])?.version;
  }

  if (releases.some((v) => v.version === version)) {
    return version;
  }
  return releases.find((v) => v.version.startsWith(`${version}.`))?.version;
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
   * @returns `undefined` when no data has a match
   */
  private async resolveFromData(
    tool: string,
    version: string | undefined,
  ): Promise<string | undefined> {
    if (version !== undefined && version !== 'latest') {
      if (!isPartialVersion(version)) {
        return undefined;
      }
      const listed = await this.toolVersions.getVersions(tool);
      if (listed && pick(listed, version) === version) {
        logger.debug(
          { tool, version, resolved: version },
          'version resolved from the embedded tool-versions data',
        );
        return version;
      }
    }

    const online = await this.toolVersions.getOnlineVersions(tool);
    if (online) {
      const resolved = pick(online, version);
      if (resolved !== undefined) {
        logger.debug(
          { tool, version, resolved },
          'version resolved from the online tool-versions data',
        );
      }
      return resolved;
    }

    const data = await this.toolVersions.getVersions(tool);
    const resolved = data && pick(data, version);
    if (resolved !== undefined) {
      logger.warn(
        { tool, version, resolved },
        'online tool-versions data not available, using the embedded, possibly outdated data',
      );
    }
    return resolved;
  }
}
