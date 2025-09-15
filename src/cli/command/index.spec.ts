import { Cli } from 'clipanion';
import { describe, expect, test } from 'vitest';
import { registerCommands } from '.';

describe('cli/command/index', () => {
  test('exits with error', () => {
    const cli = new Cli({ binaryName: 'containerbase-cli' });
    // @ts-expect-error - testing invalid mode
    expect(() => registerCommands(cli, 'invalid-mode')).not.toThrow();
  });
});
