import { Command } from 'clipanion';
import { partialVersionHelp } from '../install-tool/tool-version-resolver.ts';
import { InstallToolCommand } from './install-tool.ts';
import { command } from './utils.ts';

@command('containerbase-cli')
export class InstallPipCommand extends InstallToolCommand {
  static override paths = [['install', 'pip']];
  static override usage = Command.Usage({
    description: 'Installs a pip package into the container.',
    examples: [
      ['Installs checkov 2.4.7', '$0 install pip checkov 2.4.7'],
      [
        'Installs checkov with version via environment variable',
        'DEL_CLI_VERSION=2.4.7 $0 install pip checkov',
      ],
      ['Installs latest checkov version', '$0 install pip checkov'],
      ['Installs the newest checkov 2 release', '$0 install pip checkov 2'],
    ],
    details: partialVersionHelp,
  });

  protected override type = 'pip' as const;
}

@command('install-pip')
export class InstallPipShortCommand extends InstallPipCommand {
  static override paths = [Command.Default];

  static override usage = Command.Usage({
    description: 'Installs a pip package into the container.',
    examples: [
      ['Installs checkov v5.0.0', '$0 checkov 2.4.7'],
      [
        'Installs checkov with version via environment variable',
        'DEL_CLI_VERSION=2.4.7 $0 checkov',
      ],
      ['Installs latest checkov version', '$0 checkov'],
      ['Installs the newest checkov 2 release', '$0 checkov 2'],
    ],
    details: partialVersionHelp,
  });
}
