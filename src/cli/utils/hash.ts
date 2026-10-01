import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import type { LiteralUnion } from 'type-fest';

export type AlgorithmName = LiteralUnion<
  'sha1' | 'sha224' | 'sha256' | 'sha384' | 'sha512',
  string
>;

/** The hex digest of the data. */
export function hash(data: string | Buffer, algorithm: AlgorithmName): string {
  const hash = crypto.createHash(algorithm);
  hash.update(data);
  return hash.digest('hex');
}

/** The hex digest of the file content. */
export async function hashFile(
  file: string,
  algorithm: AlgorithmName,
): Promise<string> {
  const data = await fs.readFile(file);
  const hash = crypto.createHash(algorithm);
  hash.update(data);
  return hash.digest('hex');
}
