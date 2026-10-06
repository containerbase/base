import { isNonEmptyStringAndNotWhitespace } from '@sindresorhus/is';
import { injectFromHierarchy, injectable } from 'inversify';
import { ToolVersionResolver } from '../../install-tool/tool-version-resolver.ts';
import { semverMaxSatisfying } from '../../utils/index.ts';
import { yarnPackage } from './npm.ts';
import {
  type NodeVersionMeta,
  NpmPackageMeta,
  NpmPackageMetaList,
} from './schema.ts';

/** The version note shared by the node and npm based tools. */
export const partialVersionHelp =
  'A major or major.minor version installs the newest matching release.';

@injectable()
@injectFromHierarchy()
export class NodeVersionResolver extends ToolVersionResolver {
  readonly tool = 'node';

  override readonly versionHelp = partialVersionHelp;

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
  override readonly versionHelp = partialVersionHelp;

  /**
   * Resolves a version from the npm registry.
   *
   * - A missing version or `latest` resolves to the npm `latest` dist tag.
   * - A major (`9`) or major.minor (`9.15`) version resolves to the newest
   *   matching release, prereleases are skipped.
   * - Any other version, like a full `X.Y.Z`, is returned unchanged.
   *
   * @throws if a partial version matches no release.
   */
  async resolve(version: string | undefined): Promise<string | undefined> {
    if (!isNonEmptyStringAndNotWhitespace(version) || version === 'latest') {
      const meta = await this.getMeta(this.packageName(version));
      return meta['dist-tags'].latest;
    }
    if (/^\d+(\.\d+)?$/.test(version)) {
      const meta = await this.getMeta(this.packageName(version));
      const release = semverMaxSatisfying(Object.keys(meta.versions), version);
      if (!release) {
        throw new Error(`No ${this.tool} release found for version ${version}`);
      }
      return release;
    }
    return version;
  }

  /**
   * The npm package to look the releases up in, by default the tool itself.
   * @param _version - the requested version, `undefined` or `latest` if none
   */
  protected packageName(_version: string | undefined): string {
    return this.tool;
  }

  /** Loads the abbreviated metadata of an npm package from the registry. */
  private async getMeta(name: string): Promise<NpmPackageMeta> {
    return NpmPackageMeta.parse(
      await this.http.getJson(`https://registry.npmjs.org/${name}`, {
        headers: {
          accept:
            'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*',
        },
      }),
    );
  }
}

/**
 * Creates a version resolver for a tool which is a plain npm package.
 * @param tool - the tool and npm package name
 */
export function createNpmVersionResolver(
  tool: string,
): new () => NpmVersionResolver {
  @injectable()
  @injectFromHierarchy()
  class GenericVersionResolver extends NpmVersionResolver {
    override readonly tool: string = tool;
  }
  return GenericVersionResolver;
}

@injectable()
@injectFromHierarchy()
export class YarnVersionResolver extends NpmVersionResolver {
  readonly tool = 'yarn';

  /**
   * The npm package of the requested yarn major version, see
   * {@link yarnPackage}. `latest` uses the `@yarnpkg/cli-dist` dist tags.
   */
  protected override packageName(version: string | undefined): string {
    if (!isNonEmptyStringAndNotWhitespace(version) || version === 'latest') {
      // `latest` keeps using the dist tags of the cli dist
      return yarnPackage(2, this.env.arch);
    }
    return yarnPackage(Number.parseInt(version, 10), this.env.arch);
  }
}
