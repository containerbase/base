import fs from 'node:fs/promises';
import { env } from 'node:process';
import { describe, expect, test } from 'vitest';
import { findChecksum, hash, hashFile } from './hash.ts';

describe('cli/utils/hash', () => {
  test('findChecksum', () => {
    expect(
      findChecksum('abc  tool-arm64\ndef  tool-amd64\n', 'tool-amd64'),
    ).toBe('def');
  });

  test('findChecksum: throws on a missing checksum', () => {
    expect(() => findChecksum('abc  tool-arm64\n', 'tool-amd64')).toThrow(
      'Checksum for tool-amd64 not found',
    );
  });

  test('should hash data with sha256', () => {
    expect(hash('https://example.com/test.txt', 'sha256')).toBe(
      'd1dc63218c42abba594fff6450457dc8c4bfdd7c22acf835a50ca0e5d2693020',
    );
  });

  test('should hash file with sha256', async () => {
    const file = `${env.CONTAINERBASE_CACHE_DIR}/test.txt`;
    await fs.writeFile(file, 'https://example.com/test.txt');
    expect(await hashFile(file, 'sha256')).toBe(
      'd1dc63218c42abba594fff6450457dc8c4bfdd7c22acf835a50ca0e5d2693020',
    );
  });
});
