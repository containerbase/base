import { describe, expect, test } from 'vitest';
import { isValid, parse } from './versions';

describe('cli/utils/versions', () => {
  test('isValid', () => {
    expect(isValid('1.0.0')).toBe(true);
    expect(isValid('abc')).toBe(false);
  });

  test('parse', () => {
    expect(parse('1.0.0')).not.toBeNull();
    expect(() => parse('abc')).toThrow('Invalid version: abc');
  });
});
