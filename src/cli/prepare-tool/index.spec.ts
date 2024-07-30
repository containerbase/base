import { describe, expect, test, vi } from 'vitest';
import { prepareTools } from '.';

vi.mock('del');
vi.mock('execa');
vi.mock('../tools/bun');
vi.mock('../tools/php/composer');

vi.mock('node:process', async (importOriginal) => ({
  ...(await importOriginal<any>()),
  geteuid: () => 0,
}));

describe('index', () => {
  test('prepareTools', async () => {
    expect(await prepareTools(['bun', 'dummy'])).toBeUndefined();
  });
});
