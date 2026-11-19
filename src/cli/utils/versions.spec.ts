import { describe, expect, test } from 'vitest';
import {
  compareSegments,
  isBelowVersion,
  isFourPartVersion,
  isValid,
  parse,
} from './versions.ts';

describe('cli/utils/versions', () => {
  test('isValid', () => {
    expect(isValid('1.0.0')).toBe(true);
    expect(isValid('abc')).toBe(false);
  });

  test('isFourPartVersion', () => {
    expect(isFourPartVersion('1.0.0.0')).toBe(true);
    expect(isFourPartVersion('1.0.0')).toBe(false);
    expect(isFourPartVersion('abc')).toBe(false);
  });

  test('parse', () => {
    expect(parse('1.0.0')).not.toBeNull();
    expect(() => parse('abc')).toThrow('Invalid version: abc');
  });

  test.each([
    { version: '2.47.3', min: '2.48.0', below: true },
    { version: '2.48.0', min: '2.48.0', below: false },
    { version: '2.56.1', min: '2.48.0', below: false },
    // a prerelease of the minimum is older than it
    { version: '2.48.0-rc0', min: '2.48.0', below: true },
    { version: '2.49.0-rc0', min: '2.48.0', below: false },
    // java builds, the build is ignored
    { version: '8.0.292+10', min: '8.0.302+8', below: true },
    { version: '8.0.302+8', min: '8.0.302+8', below: false },
    { version: '11.0.12+7', min: '8.0.302+8', below: false },
    // no semver: two-part and four-part versions
    { version: '0.9', min: '1.0', below: true },
    { version: '1.0', min: '1.0', below: false },
    { version: '5.10', min: '5.7', below: false },
    { version: '24.1.0.0', min: '24.2.0.0', below: true },
    { version: '24.2.0.1', min: '24.2.0.0', below: false },
  ])('isBelowVersion $version < $min: $below', ({ version, min, below }) => {
    expect(isBelowVersion(version, min)).toBe(below);
  });

  test('compareSegments', () => {
    expect(compareSegments('4.9', '4.9.0')).toBe(0);
    expect(compareSegments('6.1.7.10', '6.1.7.9')).toBeGreaterThan(0);
    expect(compareSegments('1.0', '1.1')).toBeLessThan(0);
  });
});
