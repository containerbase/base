import { describe, expect, test } from 'vitest';
import { newestVersion } from './tool-version-resolver.ts';

describe('cli/install-tool/tool-version-resolver', () => {
  describe('newestVersion', () => {
    test('returns undefined without versions', () => {
      expect(newestVersion([])).toBeUndefined();
    });

    test.each([
      { versions: ['6.1.7', '6.1.7.9', '6.1.7.10'], expected: '6.1.7.10' },
      { versions: ['6.1.7.10', '6.1.7.9', '6.1.7'], expected: '6.1.7.10' },
      { versions: ['6.1.7.9', '6.1.7.10', '6.1.7'], expected: '6.1.7.10' },
      { versions: ['2.9.1', '2.10.0', '2.5.11'], expected: '2.10.0' },
      { versions: ['4.8', '4.9', '4.8.1'], expected: '4.9' },
      { versions: ['1.0.0.pre2', '1.0.0.pre10'], expected: '1.0.0.pre10' },
    ])('picks $expected from $versions', ({ versions, expected }) => {
      expect(newestVersion(versions)).toBe(expected);
    });

    test('treats a missing segment as 0 and keeps the first of equal versions', () => {
      expect(newestVersion(['6.1', '6.1.0'])).toBe('6.1');
      expect(newestVersion(['6.1.0', '6.1'])).toBe('6.1.0');
    });
  });
});
