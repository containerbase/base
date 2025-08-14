import { maxSatisfying } from '@renovatebot/pep440';
import { injectFromBase, injectable } from 'inversify';
import { logger } from '../../utils';
import { PipVersionResolver } from './pip';

@injectable()
@injectFromBase()
export class PoetryVersionResolver extends PipVersionResolver {
  override tool = 'poetry';

  override async resolve(
    version: string | undefined,
  ): Promise<string | undefined> {
    if (version === undefined || version === 'latest') {
      const mirrorMeta = await this.fetchMeta('poetry-plugin-pypi-mirror');
      logger.debug({ info: mirrorMeta.info }, 'poetry-plugin-pypi-mirror');

      const poetryVersion = mirrorMeta.info.requires_dist?.poetry;

      if (!poetryVersion) {
        throw new Error('poetry-plugin-pypi-mirror has missing poetry version');
      }

      const meta = await this.fetchMeta(this.tool);
      const version = maxSatisfying(
        Object.keys(meta.releases).filter((v) => !meta.releases[v]!.yanked),
        poetryVersion,
      );
      logger.debug({ version }, 'Resolved poetry version');
      return version ?? meta.info.version;
    }
    return version;
  }
}
