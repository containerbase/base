import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import type { LiteralUnion } from 'type-fest';

export type AlgorithmName = LiteralUnion<
  'sha1' | 'sha224' | 'sha256' | 'sha384' | 'sha512',
  string
>;

export function hash(data: string | Buffer, algorithm: AlgorithmName): string {
  const hash = crypto.createHash(algorithm);
  hash.update(data);
  return hash.digest('hex');
}

/**
 * Finds the checksum of `filename` in a checksum list like `SHA256SUMS`,
 * which has one `<checksum>  <filename>` line per file.
 *
 * @throws when the list has no checksum for `filename`
 */
export function findChecksum(content: string, filename: string): string {
  const checksum = content
    .split('\n')
    .find((l) => l.includes(filename))
    ?.split(' ')[0];
  if (!checksum) {
    throw new Error(`Checksum for ${filename} not found`);
  }
  return checksum;
}

export async function hashFile(
  file: string,
  algorithm: AlgorithmName,
): Promise<string> {
  const data = await fs.readFile(file);
  const hash = crypto.createHash(algorithm);
  hash.update(data);
  return hash.digest('hex');
}
