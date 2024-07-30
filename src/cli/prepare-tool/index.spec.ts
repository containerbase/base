import { describe, expect, test, vi } from 'vitest';
import { prepareTools } from '.';

vi.mock('execa');
vi.mock('../tools/bun');
vi.mock('../tools/php/composer');

describe('index', () => {
  test('prepareTools', async () => {
    expect(await prepareTools(['bun', 'dummy'])).toBeUndefined();
  });
});
