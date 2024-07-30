import { describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  main: vi.fn(),
}));

vi.mock('./main', () => mocks);

describe('index', () => {
  test('works', async () => {
    await import('./index');
    expect(mocks.main).toHaveBeenCalledTimes(1);
  });
});
