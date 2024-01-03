import is from '@sindresorhus/is';
import { inject, injectable } from 'inversify';
import { ToolVersionResolver } from '../../install-tool/tool-version-resolver';
import { EnvService, HttpService } from '../../services';
import type { NodeVersionMeta, NpmPackageMeta } from './types';

@injectable()
export class NodeVersionResolver extends ToolVersionResolver {
  readonly tool = 'node';

  constructor(
    @inject(HttpService) http: HttpService,
    @inject(EnvService) env: EnvService,
  ) {
    super(http, env);
  }

  async resolve(version: string | undefined): Promise<string | undefined> {
    if (!is.nonEmptyStringAndNotWhitespace(version) || version === 'latest') {
      const url = this.env.replaceUrl('https://nodejs.org/dist/index.json');
      const meta = await this.http.getJson<NodeVersionMeta[]>(url, {
        headers: {
          accept:
            'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*',
        },
      });
      // we know that the latest version is the first entry, so search for first lts
      return meta.find((v) => v.lts)?.version.replace(/^v/, '');
    }
    return version;
  }
}

@injectable()
export abstract class NpmVersionResolver extends ToolVersionResolver {
  constructor(
    @inject(HttpService) http: HttpService,
    @inject(EnvService) env: EnvService,
  ) {
    super(http, env);
  }

  async resolve(version: string | undefined): Promise<string | undefined> {
    if (!is.nonEmptyStringAndNotWhitespace(version) || version === 'latest') {
      const meta = await this.http.getJson<NpmPackageMeta>(
        `https://registry.npmjs.org/${this.tool}`,
        {
          headers: {
            accept:
              'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*',
          },
        },
      );
      return meta['dist-tags'].latest;
    }
    return version;
  }
}
