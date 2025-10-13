import { isNonEmptyStringAndNotWhitespace } from '@sindresorhus/is';
import { Command, Option } from 'clipanion';
import prettyMilliseconds from 'pretty-ms';
import { uninstallTool } from '../install-tool';
import { ResolverMap } from '../tools';
import type { InstallToolType } from '../utils';
import { logger } from '../utils';
import { MissingVersion } from '../utils/codes';
import { command, isToolIgnored } from './utils';

@command('containerbase-cli')
export class UninstallToolCommand extends Command {
  static override paths = [['uninstall', 'tool'], ['ut']];

  static override usage = Command.Usage({
    description: 'Uninstalls a tool from the container.',
    examples: [
      ['Uninstalls node v14.17.0', '$0 uninstall tool node 14.17.0'],
      [
        'Uninstalls node v14.17.0 with all child tools',
        '$0 uninstall tool node 14.17.0 --recursive',
      ],
      [
        'Uninstalls all node versions with all child tools',
        '$0 uninstall tool node --recursive --all',
      ],
      ['Uninstalls all jb versions', '$0 uninstall tool jb --all'],
    ],
  });

  name = Option.String();

  dryRun = Option.Boolean('-d,--dry-run', false);

  recursive = Option.Boolean('-r,--recursive', false);

  all = Option.Boolean('-a,--all', false);

  version = Option.String({ required: false });

  protected type: InstallToolType | undefined;

  override async execute(): Promise<number | void> {
    const start = Date.now();
    const { name: tool, dryRun, recursive, all } = this;

    if (await isToolIgnored(tool)) {
      logger.info({ tool }, 'tool ignored');
      return 0;
    }

    let version = this.version;

    const type = ResolverMap[tool] ?? this.type;

    if (!isNonEmptyStringAndNotWhitespace(version) && !all) {
      logger.error(`No version found for ${tool}`);
      return MissingVersion;
    }

    version = version?.replace(/^v/, ''); // trim optional 'v' prefix

    let error = false;
    logger.info(
      `Uninstalling ${type ?? 'tool'} ${tool}${version ? `@${version}` : ''}...`,
    );
    try {
      const res = await uninstallTool({
        tool,
        version,
        dryRun,
        recursive,
        type,
      });
      if (res) {
        error = true;
      }
      return res;
    } catch (err) {
      error = true;
      logger.debug(err);
      if (err instanceof Error) {
        logger.error(err.message);
      }
      return 1;
      /* v8 ignore next -- coverage bug */
    } finally {
      if (error) {
        logger.fatal(
          `Uninstall ${type ?? 'tool'} ${tool} failed in ${prettyMilliseconds(Date.now() - start)}.`,
        );
      } else {
        logger.info(
          `Uninstall ${type ?? 'tool'} ${tool} succeeded in ${prettyMilliseconds(Date.now() - start)}.`,
        );
      }
    }
  }
}

@command('uninstall-tool')
export class UninstallToolShortCommand extends UninstallToolCommand {
  static override paths = [Command.Default];
  static override usage = Command.Usage({
    description: 'Uninstalls a tool from the container.',
    examples: [
      ['Uninstalls node v14.17.0', '$0 node 14.17.0'],
      [
        'Uninstalls node v14.17.0 with all child tools',
        '$0 node 14.17.0 --recursive',
      ],
      [
        'Uninstalls all node versions with all child tools',
        '$0 node --recursive --all',
      ],
      ['Uninstalls all jb versions', '$0 jb --all'],
    ],
  });
}
