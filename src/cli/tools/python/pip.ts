import { explain, maxSatisfying } from '@renovatebot/pep440';
import { injectFromHierarchy, injectable } from 'inversify';
import {
  ToolVersionResolver,
  isPartialVersion,
  partialVersionHelp,
} from '../../install-tool/tool-version-resolver.ts';
import { logger } from '../../utils/index.ts';
import { PypiJson } from './schema.ts';

@injectable()
export abstract class PipVersionResolver extends ToolVersionResolver {
  override readonly versionHelp = partialVersionHelp;

  /**
   * Resolves a version from pypi.
   *
   * - A missing version or `latest` resolves to the latest release.
   * - A major (`21`) or major.minor (`21.3`) version which is no existing
   *   release resolves to the newest matching release, prereleases, yanked
   *   releases and releases without files are skipped. An existing release,
   *   like `5.2`, is kept, even a yanked one, like pip installs it when
   *   pinned. Without access to pypi, eg. for a package from a private index,
   *   the version is kept too.
   * - Any other version, like a full `X.Y.Z`, is returned unchanged.
   *
   * @throws if a partial version matches no release.
   */
  async resolve(version: string | undefined): Promise<string | undefined> {
    if (version === undefined || version === 'latest') {
      const meta = await this.fetchMeta(this.tool);
      return meta.info.version;
    }
    if (isPartialVersion(version)) {
      let meta: PypiJson;
      try {
        meta = await this.fetchMeta(this.tool);
      } catch (err) {
        // leave it to pip, like before partial versions were resolved
        logger.debug(
          { err, tool: this.tool, version },
          'pypi lookup failed, keeping the version',
        );
        return version;
      }
      if (Object.hasOwn(meta.releases, version)) {
        return version;
      }
      const versions = Object.entries(meta.releases)
        // a release without files has no entry, a yanked one is not installable
        .filter(([v, release]) => release && !release.yanked && isStable(v))
        .map(([v]) => v);
      // a release published as a bare `X` does not match a requested `X.Y`
      const release = maxSatisfying(versions, `==${version}.*`);
      if (!release) {
        throw new Error(`No ${this.tool} release found for version ${version}`);
      }
      return release;
    }
    return version;
  }

  /** Fetches the pypi json metadata of the package. */
  protected async fetchMeta(tool: string): Promise<PypiJson> {
    return PypiJson.parse(
      await this.http.getJson(
        `https://pypi.org/pypi/${normalizePythonDepName(tool)}/json`,
      ),
    );
  }
}

/**
 * Creates a version resolver for a tool which is a plain pip package.
 * @param tool - the tool and pypi package name
 */
export function createPipVersionResolver(
  tool: string,
): new () => PipVersionResolver {
  @injectable()
  @injectFromHierarchy()
  class GenericVersionResolver extends PipVersionResolver {
    override readonly tool: string = tool;
  }
  return GenericVersionResolver;
}

/** Checks that a version is a valid pep440 one and not a prerelease. */
function isStable(version: string): boolean {
  const parsed = explain(version);
  return !!parsed && !parsed.is_prerelease;
}

/**
 * Normalizes a python package name, eg. `Foo_Bar` to `foo-bar`.
 * @see {@link https://packaging.python.org/en/latest/specifications/name-normalization/}
 */
export function normalizePythonDepName(name: string): string {
  return name.replace(/[-_.]+/g, '-').toLowerCase();
}
