import { Command, Option } from 'clipanion';
import prettyMilliseconds from 'pretty-ms';
import { restoreInstallDir } from '../install-tool/index.ts';
import { initializeTools } from '../prepare-tool/index.ts';
import { logger } from '../utils/index.ts';
import { command } from './utils.ts';

@command('containerbase-cli')
export class InitToolCommand extends Command {
  static override paths = [['init', 'tool']];

  static override usage = Command.Usage({
    description:
      'Initialize a tool into the container. This creates missing files and directories.',
    examples: [
      ['Initialize node', '$0 init tool node'],
      ['Initialize all prepared tools', '$0 init tool all'],
    ],
  });

  tools = Option.Rest({ required: 1 });

  dryRun = Option.Boolean('-d,--dry-run', false);

  /**
   * Restores `/opt/containerbase` from the build-time snapshot when it doesn't
   * match it, eg. an empty volume, unless it's a dry run. Then initializes the
   * passed tools, or all prepared tools for `all`, also when the restore
   * failed, eg. to link the tmp dir, and reports the restore error afterwards.
   */
  async execute(): Promise<number | void> {
    const start = Date.now();
    let error = false;
    logger.info(`Initializing tools ${this.tools.join(', ')}...`);
    try {
      if (!this.dryRun) {
        try {
          await restoreInstallDir();
        } catch (err) {
          error = true;
          this.reportError(err);
        }
      }
      const res = await initializeTools(this.tools, this.dryRun);
      return error ? 1 : res;
    } catch (err) {
      error = true;
      this.reportError(err);
      return 1;
      /* v8 ignore next -- coverage bug */
    } finally {
      if (error) {
        logger.fatal(
          `Initialize tools ${this.tools.join(', ')} failed in ${prettyMilliseconds(Date.now() - start)}.`,
        );
      } else {
        logger.info(
          `Initialize tools ${this.tools.join(', ')} succeded in ${prettyMilliseconds(Date.now() - start)}.`,
        );
      }
    }
  }

  /** Logs the error, with its message as fatal when it is an `Error`. */
  private reportError(err: unknown): void {
    logger.debug(err);
    if (err instanceof Error) {
      logger.fatal(err.message);
    }
  }
}
