import { isNonEmptyStringAndNotWhitespace } from '@sindresorhus/is';
import { Command, Option } from 'clipanion';
import prettyMilliseconds from 'pretty-ms';
import { type InstallToolType, uninstallTool } from '../install-tool';
import { ResolverMap } from '../tools';
import { logger } from '../utils';
import { MissingVersion } from '../utils/codes';
import { command, isToolIgnored } from './utils';

@command('containerbase-cli')
export class UninstallToolCommand extends Command {
  static override paths = [['uninstall', 'tool'], ['ut']];

  static override usage = Command.Usage({
    description: 'Uninstalls a tool from the container.',
    examples: [
      ['Uninstalls node 14.17.0', '$0 uninstall tool node 14.17.0'],
      // ['Uninstalls latest pnpm version', '$0 uninstall tool pnpm'],
    ],
  });

  name = Option.String();

  dryRun = Option.Boolean('-d,--dry-run', false);

  version = Option.String({ required: false });

  protected type: InstallToolType | undefined;

  override async execute(): Promise<number | void> {
    const start = Date.now();

    if (await isToolIgnored(this.name)) {
      logger.info({ tool: this.name }, 'tool ignored');
      return 0;
    }

    let version = this.version;

    const type = ResolverMap[this.name] ?? this.type;

    // TODO: support uninstall all versions
    if (!isNonEmptyStringAndNotWhitespace(version)) {
      logger.error(`No version found for ${this.name}`);
      return MissingVersion;
    }

    version = version.replace(/^v/, ''); // trim optional 'v' prefix

    let error = false;
    logger.info(`Uninstalling ${type ?? 'tool'} ${this.name}@${version}...`);
    try {
      return await uninstallTool(this.name, version, this.dryRun, type);
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
          `Uninstall ${this.type ?? 'tool'} ${this.name} failed in ${prettyMilliseconds(Date.now() - start)}.`,
        );
      } else {
        logger.info(
          `Uninstall ${this.type ?? 'tool'} ${this.name} succeeded in ${prettyMilliseconds(Date.now() - start)}.`,
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
      // ['Uninstalls all pnpm versions', '$0 pnpm'],
    ],
  });
}
