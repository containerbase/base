import { describe, expect, test, vi } from 'vitest';
import { isValid, parse, validateSemver, validateVersion } from './versions';

describe('versions', () => {
  test('isValid', () => {
    expect(isValid('1.0.0')).toBe(true);
    expect(isValid('abc')).toBe(false);
  });

  test('parse', () => {
    expect(parse('1.0.0')).not.toBeNull();
    expect(parse('abc')).toBeNull();
  });

  test('validateSemver', () => {
    expect(validateSemver()('1.0.0', {})).toBe(true);
    expect(
      validateSemver()('1.0.0', { coercion: vi.fn(), coercions: [] }),
    ).toBe(true);

    expect(validateSemver()('1.0.0', { coercions: [], errors: [] })).toBe(
      false,
    );
    expect(validateSemver()('abc', { errors: [] })).toBe(false);
  });

  test('validateVersion', () => {
    expect(validateVersion()('1.0.0', {})).toBe(true);
    expect(
      validateVersion()('v1.0.0', { coercion: vi.fn(), coercions: [] }),
    ).toBe(true);

    expect(validateVersion()('v1.0.0', { coercions: [], errors: [] })).toBe(
      false,
    );
    // expect(validateVersion()('abc', { errors: [] })).toBe(false);
  });
});
