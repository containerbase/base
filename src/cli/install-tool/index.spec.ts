import { describe, expect, test, vi } from 'vitest';
import { installTool, resolveVersion } from '.';

vi.mock('del');
vi.mock('execa');
vi.mock('../tools/bun');
vi.mock('../tools/php/composer');

describe('index', () => {
  test('installTool', async () => {
    expect(await installTool('bun', '1.0.0')).toBeUndefined();
    expect(await installTool('dummy', '1.0.0')).toBeUndefined();
  });

  test('resolveVersion', async () => {
    expect(await resolveVersion('composer', '1.0.0')).toBe('1.0.0');
  });
});
