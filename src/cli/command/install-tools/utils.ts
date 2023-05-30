import type { CliMode } from '../../utils';

export function prepareToolVersion(
  mode: CliMode | null,
  args: string[]
): string[] {
  switch (mode) {
    case 'install-tool': {
      if (args.length === 1) {
        // install-tool node
        appendVersion(args, 0);
      }
      break;
    }
    case 'containerbase-cli':
    default: {
      if (args.length === 2) {
        // containerbase-cli it node
        appendVersion(args, 1);
      } else if (args.length === 3) {
        // containerbase-cli install tool node
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
