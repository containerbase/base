import is from '@sindresorhus/is';
import { injectable } from 'inversify';
import { ToolVersionResolver } from '../../install-tool/tool-version-resolver';
import type { NodeVersionMeta, NpmPackageMeta } from './types';

@injectable()
export class NodeVersionResolver extends ToolVersionResolver {
  readonly tool = 'node';

  async resolve(version: string | undefined): Promise<string | undefined> {
    if (!is.nonEmptyStringAndNotWhitespace(version) || version === 'latest') {
      const meta = await this.http.getJson<NodeVersionMeta[]>(
        'https://nodejs.org/dist/index.json',
      );
      // we know that the latest version is the first entry, so search for first lts
      return meta.find((v) => v.lts)?.version.replace(/^v/, '');
    }
    return version;
  }
}

@injectable()
export abstract class NpmVersionResolver extends ToolVersionResolver {
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
