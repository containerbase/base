import { describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  main: vi.fn(),
}));

vi.mock('./main.ts', () => mocks);

describe('cli/index', () => {
  test('works', async () => {
    await import('./index.ts');
    expect(mocks.main).toHaveBeenCalledTimes(1);
  });
});
