import { join } from 'node:path';
import { execa } from 'execa';
import { injectable } from 'inversify';
import { semverSatisfies } from '../../utils';
import { RubyBaseInstallService, RubyGemVersionResolver } from './utils';

@injectable()
export class CocoapodsInstallService extends RubyBaseInstallService {
  override readonly name: string = 'cocoapods';

  override async test(_version: string): Promise<void> {
    await execa('pod', ['--version', '--allow-root'], { stdio: 'inherit' });
  }

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

    await execa(
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
      { stdio: ['inherit', 'inherit', 1], env, cwd: this.pathSvc.installDir },
    );

    await execa(
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
      { stdio: ['inherit', 'inherit', 1], env, cwd: this.pathSvc.installDir },
    );
  }
}

@injectable()
export class CocoapodsVersionResolver extends RubyGemVersionResolver {
  override readonly tool: string = 'cocoapods';
}
