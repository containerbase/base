import { Command } from 'clipanion';
import { UninstallToolCommand } from './uninstall-tool';
import { command } from './utils';

@command('containerbase-cli')
export class UninstallGemCommand extends UninstallToolCommand {
  static override paths = [['uninstall', 'gem']];
  static override usage = Command.Usage({
    description: 'Uninstalls a gem package from the container.',
    examples: [
      ['Uninstalls rake v13.0.6', '$0 uninstall gem rake 13.0.6'],
      ['Uninstalls all rake versions', '$0 uninstall gem rake --all'],
    ],
  });

  protected override type = 'gem' as const;
}

@command('uninstall-gem')
export class UninstallGemShortCommand extends UninstallGemCommand {
  static override paths = [Command.Default];
  static override usage = Command.Usage({
    description: 'Uninstalls a gem package from the container.',
    examples: [
      ['Uninstalls rake v13.0.6', '$0 rake 13.0.6'],
      ['Uninstalls all rake versions', '$0 rake --all'],
    ],
  });
}
