import { Command } from 'clipanion';
import { UninstallToolCommand } from './uninstall-tool';
import { command } from './utils';

@command('containerbase-cli')
export class UninstallPipCommand extends UninstallToolCommand {
  static override paths = [['uninstall', 'pip']];
  static override usage = Command.Usage({
    description: 'Uninstalls a pip package from the container.',
    examples: [
      ['Installs checkov 2.4.7', '$0 uninstall pip checkov 2.4.7'],
      // TODO: uninstall all versions
      // ['Uninstalls all but latest installed checkov version', '$0 uninstall pip checkov'],
    ],
  });

  protected override type = 'pip' as const;
}

@command('uninstall-pip')
export class UninstallPipShortCommand extends UninstallPipCommand {
  static override paths = [Command.Default];
  static override usage = Command.Usage({
    description: 'Uninstalls a pip package from the container.',
    examples: [
      ['Uninstalls checkov v5.0.0', '$0 checkov 2.4.7'],
      // TODO: uninstall all versions
      // ['Uninstalls all but latest installed checkov version', '$0 checkov'],
    ],
  });
}
