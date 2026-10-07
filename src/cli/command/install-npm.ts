import { Command } from 'clipanion';
import { npmPartialVersionHelp } from '../tools/node/resolver.ts';
import { InstallToolCommand } from './install-tool.ts';
import { command } from './utils.ts';

@command('containerbase-cli')
export class InstallNpmCommand extends InstallToolCommand {
  static override paths = [['install', 'npm']];
  static override usage = Command.Usage({
    description: 'Installs a npm package into the container.',
    examples: [
      ['Installs del-cli 5.0.0', '$0 install npm del-cli 5.0.0'],
      [
        'Installs del-cli with version via environment variable',
        'DEL_CLI_VERSION=5.0.0 $0 install npm del-cli',
      ],
      ['Installs latest del-cli version', '$0 install npm del-cli'],
      ['Installs a del-cli 5 release', '$0 install npm del-cli 5'],
    ],
    details: npmPartialVersionHelp,
  });

  protected override type = 'npm' as const;
}

@command('install-npm')
export class InstallNpmShortCommand extends InstallNpmCommand {
  static override paths = [Command.Default];

  static override usage = Command.Usage({
    description: 'Installs a npm package into the container.',
    examples: [
      ['Installs del-cli v5.0.0', '$0 del-cli 5.0.0'],
      [
        'Installs del-cli with version via environment variable',
        'DEL_CLI_VERSION=5.0.0 $0 del-cli',
      ],
      ['Installs latest del-cli version', '$0 del-cli'],
      ['Installs a del-cli 5 release', '$0 del-cli 5'],
    ],
    details: npmPartialVersionHelp,
  });
}
