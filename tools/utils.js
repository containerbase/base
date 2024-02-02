import fs from 'fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';

/**
 * Writes `<algorithm>sum` compatible checksum file.
 * @param {string} file
 * @param {string} algorithm
 */
export async function hashFile(file, algorithm) {
  const data = await fs.readFile(file);
  const hash = crypto.createHash(algorithm);
  hash.update(data);
  await fs.writeFile(
    `${file}.${algorithm}`,
    `${hash.digest('hex')}  ${path.basename(file)}`,
  );
}
