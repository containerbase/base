import { isNonEmptyStringAndNotWhitespace } from '@sindresorhus/is';
import { injectFromHierarchy, injectable } from 'inversify';
import { ToolVersionResolver } from '../../install-tool/tool-version-resolver.ts';
import { logger } from '../../utils/index.ts';
import {
  type NodeVersionMeta,
  NpmPackageMeta,
  NpmPackageMetaList,
} from './schema.ts';

@injectable()
@injectFromHierarchy()
export class NodeVersionResolver extends ToolVersionResolver {
  readonly tool = 'node';

  override readonly versionHelp =
    'A major or major.minor version, like `22` or `22.11`, installs the newest matching release.';

  /**
   * Resolves a version from nodejs.org.
   *
   * - A missing version or `latest` resolves to the newest lts release.
   * - A major (`20`) or major.minor (`20.11`) version resolves to the newest
   *   matching release.
   * - Any other version, like a full `X.Y.Z`, is returned unchanged.
   *
   * @throws if a partial version matches no release.
   */
  async resolve(version: string | undefined): Promise<string | undefined> {
    if (!isNonEmptyStringAndNotWhitespace(version) || version === 'latest') {
      const meta = await this.getReleases();
      // we know that the latest version is the first entry, so search for first lts
      return meta.find((v) => v.lts)?.version.replace(/^v/, '');
    }
    if (/^\d+(\.\d+)?$/.test(version)) {
      const prefix = `v${version}.`;
      const meta = await this.getReleases();
      // newer releases come first, so the first match is the newest of that line
      const release = meta.find((v) => v.version.startsWith(prefix));
      if (!release) {
        throw new Error(`No node release found for version ${version}`);
      }
      return release.version.replace(/^v/, '');
    }
    return version;
  }

  /** Loads the list of node releases from nodejs.org, newest first. */
  private async getReleases(): Promise<NodeVersionMeta[]> {
    return NpmPackageMetaList.parse(
      await this.http.getJson('https://nodejs.org/dist/index.json'),
    );
  }
}

@injectable()
export abstract class NpmVersionResolver extends ToolVersionResolver {
  /** Resolves a missing version or `latest` to the npm `latest` dist tag. */
  async resolve(version: string | undefined): Promise<string | undefined> {
    if (!isNonEmptyStringAndNotWhitespace(version) || version === 'latest') {
      const meta = NpmPackageMeta.parse(
        await this.http.getJson(`https://registry.npmjs.org/${this.tool}`, {
          headers: {
            accept:
              'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*',
          },
        }),
      );
      return meta['dist-tags'].latest;
    }
    return version;
  }
}

@injectable()
@injectFromHierarchy()
export class YarnVersionResolver extends ToolVersionResolver {
  readonly tool = 'yarn';

  /**
   * Resolves a missing version or `latest` to the `latest` dist tag of
   * `@yarnpkg/cli-dist`.
   */
  async resolve(version: string | undefined): Promise<string | undefined> {
    if (!isNonEmptyStringAndNotWhitespace(version) || version === 'latest') {
      const meta = NpmPackageMeta.parse(
        await this.http.getJson(
          `https://registry.npmjs.org/@yarnpkg/cli-dist`,
          {
            headers: {
              accept:
                'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*',
            },
          },
        ),
      );
      logger.debug({ meta }, 'NpmPackageMeta');
      return meta['dist-tags'].latest;
    }
    return version;
  }
}
