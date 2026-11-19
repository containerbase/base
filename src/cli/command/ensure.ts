import { Command, Option } from 'clipanion';
import { ensureTool } from '../install-tool/index.ts';
import { logger } from '../utils/index.ts';
import { command } from './utils.ts';

@command('containerbase-cli')
export class EnsureCommand extends Command {
  static override paths = [['ensure']];

  static override usage = Command.Usage({
    description:
      'Makes a command of an installed tool run again, called by its shim when the version of the command is missing. Installs the version again, never changes which version a command runs.',
    examples: [['Ensure the node command', '$0 ensure node']],
  });

  command = Option.String();

  /**
   * Restores the command of an installed tool, see
   * `InstallToolService.ensure`. It only logs failures, the shim calls it with
   * the log level `warn` and stdout redirected to stderr.
   */
  async execute(): Promise<number | void> {
    try {
      return await ensureTool(this.command);
    } catch (err) {
      logger.debug(err);
      if (err instanceof Error) {
        logger.error(err.message);
      }
      return 1;
    }
  }
}
