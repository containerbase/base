import { injectable } from 'inversify';
import { ToolVersionResolver } from '../../install-tool/tool-version-resolver.ts';
import { PypiJson } from './schema.ts';

@injectable()
export abstract class PipVersionResolver extends ToolVersionResolver {
  /** Resolves a missing version or `latest` to the latest pypi release. */
  async resolve(version: string | undefined): Promise<string | undefined> {
    if (version === undefined || version === 'latest') {
      const meta = await this.fetchMeta(this.tool);
      return meta.info.version;
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
 * Normalizes a python package name, eg. `Foo_Bar` to `foo-bar`.
 * @see {@link https://packaging.python.org/en/latest/specifications/name-normalization/}
 */
export function normalizePythonDepName(name: string): string {
  return name.replace(/[-_.]+/g, '-').toLowerCase();
}
