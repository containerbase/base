import { maxSatisfying } from '@renovatebot/pep440';
import { injectFromHierarchy, injectable } from 'inversify';
import { logger } from '../../utils/index.ts';
import { PipVersionResolver } from './pip.ts';

@injectable()
@injectFromHierarchy()
export class PoetryVersionResolver extends PipVersionResolver {
  override tool = 'poetry';

  /**
   * Resolves a missing version or `latest` to the newest poetry release
   * supported by `poetry-plugin-pypi-mirror`. A partial version resolves to
   * the newest matching release, regardless of the plugin.
   *
   * @throws when the plugin has no poetry requirement
   */
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
        Object.entries(meta.releases)
          // a release without files has no entry, a yanked one is not installable
          .filter(([, release]) => release && !release.yanked)
          .map(([v]) => v),
        poetryVersion,
      );
      logger.debug({ version }, 'Resolved poetry version');
      return version ?? meta.info.version;
    }
    return super.resolve(version);
  }
}
