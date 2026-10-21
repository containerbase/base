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
  /** Takes all registered tool version resolvers and the embedded data. */
  constructor(
    @multiInject(TOOL_VERSION_RESOLVER) private resolver: ToolVersionResolver[],
    @inject(ToolVersionsService) private toolVersions: ToolVersionsService,
  ) {}

  /**
   * Resolves the version with the tool's resolver. A tool without a resolver
   * is resolved from the embedded tool-versions data, and keeps its version
   * when the data can't answer.
   */
  async resolve(
    tool: string,
    version: string | undefined,
  ): Promise<string | undefined> {
    const resolver = this.resolver.find((r) => r.tool === tool);
    if (resolver) {
      return (await resolver.resolve(version)) ?? version;
    }
    return (await this.resolveEmbedded(tool, version)) ?? version;
  }

  /**
   * Resolves a missing version, `latest` or a partial version from the
   * embedded data, any other version is not checked. A resolved version is
   * logged at debug level.
   * @returns `undefined` when the embedded data can't answer
   */
  private async resolveEmbedded(
    tool: string,
    version: string | undefined,
  ): Promise<string | undefined> {
    if (
      version !== undefined &&
      version !== 'latest' &&
      !isPartialVersion(version)
    ) {
      return undefined;
    }

    const data = await this.toolVersions.getVersions(tool);
    const resolved = data && pick(data, version);
    if (resolved !== undefined) {
      logger.debug(
        { tool, version, resolved },
        'version resolved from the embedded tool-versions data',
      );
    }
    return resolved;
  }
}
