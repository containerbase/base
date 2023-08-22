import type { CliMode } from '../utils';

export function prepareToolVersion(
  mode: CliMode | null,
  args: string[],
): string[] {
  switch (mode) {
    case 'prepare-tool':
      break;
    case 'install-tool':
    case 'install-npm': {
      if (args.length === 1) {
        // install-tool node
        // install-npm corepack
        appendVersion(args, 0);
      }
      break;
    }
    case 'containerbase-cli':
    default: {
      if (args.length === 2 && args[0] === 'it') {
        // containerbase-cli it node
        appendVersion(args, 1);
      } else if (
        args.length === 3 &&
        args[0] === 'install' &&
        (args[1] === 'tool' || args[1] === 'npm')
      ) {
        // containerbase-cli install tool node
        // containerbase-cli install npm corepack
        appendVersion(args, 2);
      }
      break;
    }
  }
  return args;
}

function appendVersion(args: string[], index: number): void {
  const tool = args.at(index)!;
  const version =
    process.env[tool.replace('-', '_').toUpperCase() + '_VERSION'];
  if (version) {
    args.push(version);
  }
}
