import { maxSatisfying, satisfies } from '@renovatebot/pep440';
import { injectFromHierarchy, injectable } from 'inversify';
import type { DataFilter } from '../../install-tool/tool-version-resolver.ts';
import { logger } from '../../utils/index.ts';
import { PipVersionResolver } from './pip.ts';

@injectable()
@injectFromHierarchy()
export class PoetryVersionResolver extends PipVersionResolver {
  override tool = 'poetry';

  /** The releases of the data, like for the other typed pip tools. */
  override readonly dataField = 'versions';
  /**
   * The lookup of the poetry range of `poetry-plugin-pypi-mirror`, made once
   * per instance, so {@link dataFilter} and {@link resolve} share it.
   */
  private range: Promise<string> | undefined;

  /**
   * Limits a missing version or `latest` from the tool-versions data to the
   * poetry releases `poetry-plugin-pypi-mirror` supports, like
   * {@link resolve} does, a partial version isn't limited.
   *
   * @throws when the plugin has no poetry requirement
   */
  override async dataFilter(
    version: string | undefined,
  ): Promise<DataFilter | undefined> {
    if (version !== undefined) {
      return undefined;
    }
    const range = await this.mirrorRange();
    return (v) => satisfies(v, range);
  }

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
   * The poetry version range `poetry-plugin-pypi-mirror` supports, looked up
   * once per instance, see {@link fetchMirrorRange}.
   *
   * @throws when the plugin has no poetry requirement
   */
  private mirrorRange(): Promise<string> {
    return (this.range ??= this.fetchMirrorRange());
  }

  /**
   * Fetches the poetry version range `poetry-plugin-pypi-mirror` supports from
   * pypi.
   *
   * @throws when the plugin has no poetry requirement
   */
  private async fetchMirrorRange(): Promise<string> {
    const mirrorMeta = await this.fetchMeta('poetry-plugin-pypi-mirror');
    logger.debug({ info: mirrorMeta.info }, 'poetry-plugin-pypi-mirror');

    const poetryVersion = mirrorMeta.info.requires_dist?.poetry;

    if (!poetryVersion) {
      throw new Error('poetry-plugin-pypi-mirror has missing poetry version');
    }
    return poetryVersion;
  }
}
