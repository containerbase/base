import { Command } from 'clipanion';
import { UninstallToolCommand } from './uninstall-tool';
import { command } from './utils';

@command('containerbase-cli')
export class UninstallNpmCommand extends UninstallToolCommand {
  static override paths = [['uninstall', 'npm']];
  static override usage = Command.Usage({
    description: 'Uninstalls a npm package from the container.',
    examples: [
      ['Uninstalls del-cli v5.0.0', '$0 uninstall npm del-cli 5.0.0'],
      ['Uninstalls all del-cli versions', '$0 uninstall npm del-cli --all'],
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
      ['Uninstalls all del-cli versions', '$0 del-cli --all'],
    ],
  });
}
