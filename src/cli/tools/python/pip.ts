import { injectFromBase, injectable } from 'inversify';
import { ToolVersionResolver } from '../../install-tool/tool-version-resolver';
import { PypiJson } from './schema';

@injectable()
@injectFromBase()
export abstract class PipVersionResolver extends ToolVersionResolver {
  async resolve(version: string | undefined): Promise<string | undefined> {
    if (version === undefined || version === 'latest') {
      const meta = await this.fetchMeta(this.tool);
      return meta.info.version;
    }
    return version;
  }

  protected async fetchMeta(tool: string): Promise<PypiJson> {
    return PypiJson.parse(
      await this.http.getJson(
        `https://pypi.org/pypi/${normalizePythonDepName(tool)}/json`,
      ),
    );
  }
}

// https://packaging.python.org/en/latest/specifications/name-normalization/
export function normalizePythonDepName(name: string): string {
  return name.replace(/[-_.]+/g, '-').toLowerCase();
}
