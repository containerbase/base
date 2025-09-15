import process from 'node:process';
import { Cli } from 'clipanion';
import { describe, expect, test, vi } from 'vitest';
import { InvalidCommand } from '../utils/codes';
import { prepareCommands } from '.';

describe('cli/command/index', () => {
  test('exits with error', () => {
    const cli = new Cli({ binaryName: 'containerbase-cli' });
    vi.spyOn(process, 'exit').mockReturnValue(undefined as never);
    // @ts-expect-error - testing invalid mode
    expect(() => prepareCommands(cli, 'invalid-mode')).not.toThrow();
    expect(process.exit).toHaveBeenCalledWith(InvalidCommand);
  });
});
