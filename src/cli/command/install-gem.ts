import { Command } from 'clipanion';
import { InstallToolCommand } from './install-tool';
import { command } from './utils';

@command('containerbase-cli')
export class InstallGemCommand extends InstallToolCommand {
  static override paths = [['install', 'gem']];
  static override usage = Command.Usage({
    description: 'Installs a gem package into the container.',
    examples: [
      ['Installs rake 13.0.6', '$0 install gem rake 13.0.6'],
      [
        'Installs rake with version via environment variable',
        'RAKE_VERSION=13.0.6 $0 install gem rake',
      ],
      // ['Installs latest rake version', '$0 install gem rake'], // not yet supported
    ],
  });

  protected override type = 'gem' as const;
}

@command('install-gem')
export class InstallGemShortCommand extends InstallGemCommand {
  static override paths = [Command.Default];

  static override usage = Command.Usage({
    description: 'Installs a gem package into the container.',
    examples: [
      ['Installs rake v13.0.6', '$0 rake 13.0.6'],
      [
        'Installs rake with version via environment variable',
        'RAKE_VERSION=13.0.6 $0 rake',
      ],
      // ['Installs latest rake version', '$0 rake'], // not yet supported
    ],
  });
}
