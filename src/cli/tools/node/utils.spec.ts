import { describe, expect, test } from 'vitest';
import { getNodeOptions } from './utils';

describe('cli/tools/node/utils', () => {
  describe('getNodeOptions', () => {
    test('returns --use-openssl-ca when NODE_OPTIONS is not set', () => {
      expect(getNodeOptions(undefined)).toBe('--use-openssl-ca');
    });

    test('returns --use-openssl-ca when NODE_OPTIONS is empty', () => {
      expect(getNodeOptions('')).toBe('--use-openssl-ca');
    });

    test('extends existing NODE_OPTIONS', () => {
      expect(getNodeOptions('--max-old-space-size=4096')).toBe(
        '--max-old-space-size=4096 --use-openssl-ca',
      );
    });

    test('does not duplicate --use-openssl-ca when already present at start', () => {
      expect(getNodeOptions('--use-openssl-ca --max-old-space-size=4096')).toBe(
        '--use-openssl-ca --max-old-space-size=4096',
      );
    });

    test('does not duplicate --use-openssl-ca when already present at end', () => {
      expect(getNodeOptions('--max-old-space-size=4096 --use-openssl-ca')).toBe(
        '--max-old-space-size=4096 --use-openssl-ca',
      );
    });

    test('does not duplicate --use-openssl-ca when already present in middle', () => {
      expect(
        getNodeOptions(
          '--max-old-space-size=4096 --use-openssl-ca --no-warnings',
        ),
      ).toBe('--max-old-space-size=4096 --use-openssl-ca --no-warnings');
    });

    test('handles multiple spaces between options', () => {
      expect(getNodeOptions('--max-old-space-size=4096  --no-warnings')).toBe(
        '--max-old-space-size=4096  --no-warnings --use-openssl-ca',
      );
    });

    test('does not treat a partial match for the --use-openssl-ca option as a match', () => {
      expect(getNodeOptions('--use-openssl-can-can-can')).toBe(
        '--use-openssl-can-can-can --use-openssl-ca',
      );
    });
  });
});
