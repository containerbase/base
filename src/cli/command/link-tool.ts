import { Command, Option } from 'clipanion';
import prettyMilliseconds from 'pretty-ms';
import { linkTool } from '../install-tool';
import { logger } from '../utils';

export class LinkToolCommand extends Command {
  static override paths = [['link', 'tool'], ['lt']];

  static override usage = Command.Usage({
    description:
      'Links a tool into the global tool path. For internal use only.',
  });

  name = Option.String();
  src = Option.String();

  exports = Option.String({ required: false });
  args = Option.String({ required: false });

  body = Option.String({ required: false });

  tool = Option.String('--tool-name', { env: 'TOOL_NAME' });
  version = Option.String('--tool-version', { env: 'TOOL_VERSION' });

  async execute(): Promise<number | void> {
    if (!this.tool) {
      logger.error(`Missing 'TOOL_NAME' environment variable`);
      return 1;
    }
    if (!this.version) {
      logger.error(`Missing 'TOOL_VERSION' environment variable`);
      return 1;
    }
    const start = Date.now();
    let error = false;
    logger.debug(`Linking tool ${this.name} (${this.tool})...`);
    try {
      return await linkTool(this.tool, {
        name: this.name,
        srcDir: this.src,
        exports: this.exports,
        args: this.args,
        body: this.body,
      });
    } catch (err) {
      error = true;
      logger.debug(err);
      if (err instanceof Error) {
        logger.fatal(err.message);
      }
      return 1;
      /* v8 ignore next -- coverage bug */
    } finally {
      if (error) {
        logger.fatal(
          `Linking tools ${this.name} (${this.tool}) failed in ${prettyMilliseconds(Date.now() - start)}.`,
        );
      } else {
        logger.debug(
          `Linking tools ${this.name} (${this.tool}) succeded in ${prettyMilliseconds(Date.now() - start)}.`,
        );
      }
    }
  }
}
