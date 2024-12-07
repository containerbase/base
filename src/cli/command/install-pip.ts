import { Command } from 'clipanion';
import { InstallToolCommand } from './install-tool';

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
      // TODO: add version resolver
      // ['Installs latest checkov version', '$0 install pip checkov'],
    ],
  });

  protected override type = 'pip' as const;
}

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
      // TODO: add version resolver
      // ['Installs latest checkov version', '$0 checkov'],
    ],
  });
}
