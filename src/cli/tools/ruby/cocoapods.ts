import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { semverSatisfies } from '../../utils/index.ts';
import { RubyBaseInstallService, RubyGemVersionResolver } from './utils.ts';

@injectable()
@injectFromHierarchy()
export class CocoapodsInstallService extends RubyBaseInstallService {
  override readonly name: string = 'cocoapods';

  /** Checks that `pod --version` runs, also as root. */
  override async test(_version: string): Promise<void> {
    await this._spawn('pod', ['--version', '--allow-root']);
  }

  /**
   * Pins activesupport below 7.1 for cocoapods 1.12.0 to 1.13.0, which break
   * with newer versions.
   */
  protected override async _postInstall(
    gem: string,
    version: string,
    prefix: string,
    env: NodeJS.ProcessEnv,
  ): Promise<void> {
    // https://github.com/containerbase/base/issues/1547
    if (!semverSatisfies(version, '1.12.0 - 1.13.0')) {
      return;
    }

    await this._spawn(
      gem,
      [
        'install',
        'activesupport',
        '--install-dir',
        prefix,
        '--bindir',
        join(prefix, 'bin'),
        '--version',
        '<7.1.0',
      ],
      { env },
    );

    await this._spawn(
      gem,
      [
        'uninstall',
        'activesupport',
        '--install-dir',
        prefix,
        '--bindir',
        join(prefix, 'bin'),
        '--version',
        '>=7.1.0',
      ],
      { env },
    );
  }
}

@injectable()
@injectFromHierarchy()
export class CocoapodsVersionResolver extends RubyGemVersionResolver {
  override readonly tool: string = 'cocoapods';
}
