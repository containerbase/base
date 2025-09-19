import { Command } from 'clipanion';
import { UninstallToolCommand } from './uninstall-tool';
import { command } from './utils';

@command('containerbase-cli')
export class UninstallNpmCommand extends UninstallToolCommand {
  static override paths = [['uninstall', 'npm']];
  static override usage = Command.Usage({
    description: 'Uninstalls a npm package from the container.',
    examples: [
      ['Uninstalls del-cli 5.0.0', '$0 install npm del-cli 5.0.0'],
      // ['Installs latest del-cli version', '$0 install npm del-cli'],
    ],
  });

  protected override type = 'npm' as const;
}

@command('uninstall-npm')
export class UninstallNpmShortCommand extends UninstallNpmCommand {
  static override paths = [Command.Default];
  static override usage = Command.Usage({
    description: 'Uninstalls a npm package from the container.',
    examples: [
      ['Uninstalls del-cli v5.0.0', '$0 del-cli 5.0.0'],
      // ['Installs latest del-cli version', '$0 del-cli'],
    ],
  });
}
