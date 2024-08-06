import { isNonEmptyStringAndNotWhitespace } from '@sindresorhus/is';
import { Command, Option } from 'clipanion';
import prettyMilliseconds from 'pretty-ms';
import {
  type InstallToolType,
  installTool,
  resolveVersion,
} from '../install-tool';
import { DeprecatedTools, ResolverMap } from '../tools';
import { logger } from '../utils';
import { MissingVersion } from '../utils/codes';
import { getVersion, isToolIgnored } from './utils';

export class InstallToolCommand extends Command {
  static override paths = [['install', 'tool'], ['it']];

  static override usage = Command.Usage({
    description: 'Installs a tool into the container.',
    examples: [
      ['Installs node 14.17.0', '$0 install tool node 14.17.0'],
      [
        'Installs node with version via environment variable',
        'NODE_VERSION=14.17.0 $0 install tool node',
      ],
      ['Installs latest pnpm version', '$0 install tool pnpm'],
    ],
  });

  name = Option.String();

  dryRun = Option.Boolean('-d,--dry-run', false);

  version = Option.String({ required: false });

  protected type: InstallToolType | undefined;

  override async execute(): Promise<number | void> {
    const start = Date.now();

    if (isToolIgnored(this.name)) {
      logger.info({ tool: this.name }, 'tool ignored');
      return 0;
    }

    let version = this.version?.replace(/^v/, ''); // trim optional 'v' prefix

    let type = DeprecatedTools[this.name];

    if (type) {
      logger.warn(
        `The 'install-tool ${this.name}' command is deprecated. Please use the 'install-${type} ${this.name}'.`,
      );
    } else {
      type = ResolverMap[this.name] ?? this.type;
    }

    if (!isNonEmptyStringAndNotWhitespace(version)) {
      version = getVersion(this.name)?.replace(/^v/, ''); // trim optional 'v' prefix
    }

    logger.debug(
      `Try resolving version for ${this.name}@${version ?? 'latest'} ...`,
    );
    version = await resolveVersion(this.name, version, type);

    if (!isNonEmptyStringAndNotWhitespace(version)) {
      logger.error(`No version found for ${this.name}`);
      return MissingVersion;
    }

    version = version.replace(/^v/, ''); // trim optional 'v' prefix

    let error = false;
    logger.info(`Installing ${type ?? 'tool'} ${this.name}@${version}...`);
    try {
      return await installTool(this.name, version, this.dryRun, type);
    } catch (err) {
      error = true;
      logger.debug(err);
      if (err instanceof Error) {
        logger.error(err.message);
      }
      return 1;
    } finally {
      if (error) {
        logger.fatal(
          `Install ${this.type ?? 'tool'} ${this.name} failed in ${prettyMilliseconds(Date.now() - start)}.`,
        );
      } else {
        logger.info(
          `Install ${this.type ?? 'tool'} ${this.name} succeeded in ${prettyMilliseconds(Date.now() - start)}.`,
        );
      }
    }
  }
}

export class InstallToolShortCommand extends InstallToolCommand {
  static override paths = [Command.Default];
  static override usage = Command.Usage({
    description: 'Installs a tool into the container.',
    examples: [
      ['Installs node v14.17.0', '$0 node 14.17.0'],
      [
        'Installs node with version via environment variable',
        'NODE_VERSION=14.17.0 $0 node',
      ],
      ['Installs latest pnpm version', '$0 pnpm'],
    ],
  });
}
