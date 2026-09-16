import { writeFile } from 'node:fs/promises';
import { Command, Option } from 'clipanion';
import prettyMilliseconds from 'pretty-ms';
import {
  type InstalledTool,
  VersionService,
  createContainer,
} from '../services/index.ts';
import { logger } from '../utils/index.ts';
import { command } from './utils.ts';

function toText(tools: InstalledTool[]): string {
  if (!tools.length) {
    return 'No tools installed.\n';
  }

  const width = Math.max(...tools.map((t) => t.name.length));

  return tools
    .map(({ name, version, versions }) => {
      const others = new Set(versions.map((v) => v.version));
      if (version) {
        others.delete(version);
      }
      const rest = others.size
        ? ` (Other installed versions: ${Array.from(others).join(', ')})`
        : '';
      return `${name.padEnd(width)}  ${version ?? '-'}${rest}\n`;
    })
    .join('');
}

@command('containerbase-cli')
export class ListToolsCommand extends Command {
  static override paths = [['list', 'tools']];

  static override usage = Command.Usage({
    description: 'Lists all installed tools and their versions.',
    details: `
      Prints the currently linked version of every installed tool.
      Additional installed versions are listed in parentheses.
      The json output is described by \`docs/list-tools.schema.json\`.
    `,
    examples: [
      ['List all installed tools', '$0 list tools'],
      ['List all installed tools as json', '$0 list tools --json'],
      [
        'Write the json output to a file',
        '$0 list tools --json --out /tmp/tools.json',
      ],
    ],
  });

  json = Option.Boolean('--json', false, {
    description: 'Outputs the tool list as json.',
  });

  out = Option.String('--out', {
    description: 'Writes the output to the given file instead of stdout.',
  });

  async execute(): Promise<number | void> {
    const start = Date.now();
    let error = false;
    // status logs go to stdout, where they would corrupt the json output
    if (!this.json) {
      logger.debug('Listing tools...');
    }
    try {
      const container = createContainer();
      const versionSvc = await container.getAsync(VersionService);
      const tools = await versionSvc.listInstalled();

      if (this.out) {
        // no need to pretty print for a file
        const output = this.json
          ? `${JSON.stringify({ tools })}\n`
          : toText(tools);
        await writeFile(this.out, output, { encoding: 'utf8' });
      } else {
        const output = this.json
          ? `${JSON.stringify({ tools }, null, 2)}\n`
          : toText(tools);
        this.context.stdout.write(output);
      }

      return 0;
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
          `Listing tools failed in ${prettyMilliseconds(Date.now() - start)}.`,
        );
      } else if (!this.json) {
        logger.debug(
          `Listing tools succeeded in ${prettyMilliseconds(Date.now() - start)}.`,
        );
      }
    }
  }
}
