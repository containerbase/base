import { describe, expect, test, vi } from 'vitest';
import { main } from './main';

const mocks = vi.hoisted(() => ({
  argv0: 'containerbase-cli',
  argv: ['node', 'containerbase-cli', 'help'],
  exit: vi.fn(),
}));

vi.mock('node:process', async (importOriginal) => ({
  ...(await importOriginal<any>()),
  ...mocks,
}));

vi.mock('./utils/common', async (importActual) => ({
  ...(await importActual<any>()),
  validateSystem: vi.fn(),
}));

describe('cli/main', () => {
  test('works', async () => {
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    expect(await main()).toBeUndefined();
    expect(mocks.exit).toHaveBeenCalled();
  });
});
