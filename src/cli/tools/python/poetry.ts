import { maxSatisfying } from '@renovatebot/pep440';
import { injectFromHierarchy, injectable } from 'inversify';
import { logger } from '../../utils/index.ts';
import { PipVersionResolver } from './pip.ts';

@injectable()
@injectFromHierarchy()
export class PoetryVersionResolver extends PipVersionResolver {
  override tool = 'poetry';

  /**
   * The tool-level `latest` of the data, the newest release within the range
   * of `poetry-plugin-pypi-mirror`; data without it uses pypi.
   */
  override readonly dataField = 'latest';

  /**
   * Resolves a missing version or `latest` to the newest poetry release
   * supported by `poetry-plugin-pypi-mirror`, when the tool-versions data
   * can't answer, see {@link dataField}. A partial version resolves to the
   * newest matching release, regardless of the plugin.
   *
   * @throws when the plugin has no poetry requirement
   */
  override async resolve(
    version: string | undefined,
  ): Promise<string | undefined> {
    if (version === undefined || version === 'latest') {
      const poetryVersion = await this.mirrorRange();
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

  /**
   * Fetches the poetry version range `poetry-plugin-pypi-mirror` supports from
   * pypi.
   *
   * @throws when the plugin has no poetry requirement
   */
  private async mirrorRange(): Promise<string> {
    const mirrorMeta = await this.fetchMeta('poetry-plugin-pypi-mirror');
    logger.debug({ info: mirrorMeta.info }, 'poetry-plugin-pypi-mirror');

    const poetryVersion = mirrorMeta.info.requires_dist?.poetry;

    if (!poetryVersion) {
      throw new Error('poetry-plugin-pypi-mirror has missing poetry version');
    }
    return poetryVersion;
  }
}
