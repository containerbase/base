import is from '@sindresorhus/is';
import { injectable } from 'inversify';
import { ToolVersionResolver } from '../../install-tool/tool-version-resolver';
import { logger } from '../../utils';
import { NpmPackageMeta, NpmPackageMetaList } from './schema';

@injectable()
export class NodeVersionResolver extends ToolVersionResolver {
  readonly tool = 'node';

  async resolve(version: string | undefined): Promise<string | undefined> {
    if (!is.nonEmptyStringAndNotWhitespace(version) || version === 'latest') {
      const meta = NpmPackageMetaList.parse(
        await this.http.getJson('https://nodejs.org/dist/index.json'),
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
export class YarnVersionResolver extends ToolVersionResolver {
  readonly tool = 'yarn';
  async resolve(version: string | undefined): Promise<string | undefined> {
    if (!is.nonEmptyStringAndNotWhitespace(version) || version === 'latest') {
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
