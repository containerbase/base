import { describe, expect, test } from 'vitest';
import { getToolType } from './index.ts';

describe('cli/tools/index', () => {
  describe('getToolType', () => {
    const map = { poetry: 'pip', pnpm: 'npm' } as const;

    test('returns the type of a mapped tool', () => {
      expect(getToolType(map, 'poetry')).toBe('pip');
      expect(getToolType(map, 'pnpm')).toBe('npm');
    });

    test('returns undefined for an unknown tool', () => {
      expect(getToolType(map, 'unknown')).toBeUndefined();
    });

    test.each(['constructor', 'toString', '__proto__'])(
      'returns undefined for the prototype key %s',
      (name) => {
        expect(getToolType(map, name)).toBeUndefined();
      },
    );
  });
});
