import fs from 'node:fs/promises';
import path from 'node:path';
import { codeBlock } from 'common-tags';
import { beforeEach, describe, expect, test } from 'vitest';
import { addBlockedCerts, blockedCerts } from './blocked-certs.ts';
import { ensurePaths, rootPath } from '~test/path.ts';

const stock = codeBlock`
  Algorithm=SHA-256
  0000000000000000000000000000000000000000000000000000000000000001
`;
const all = blockedCerts.join('\n');

describe('cli/tools/java/blocked-certs', () => {
  let dir: string;

  beforeEach(async () => {
    dir = rootPath('java/lib/security');
    await fs.rm(dir, { recursive: true, force: true });
    await ensurePaths('java/lib/security');
  });

  test('appends to blocked.certs and keeps its entries', async () => {
    const file = path.join(dir, 'blocked.certs');
    await fs.writeFile(file, `${stock}\n`);

    await addBlockedCerts(dir);

    expect(await fs.readFile(file, 'utf8')).toBe(`${stock}\n${all}\n`);
  });

  test('appends to a blocked list without a trailing newline', async () => {
    const file = path.join(dir, 'blocked.certs');
    await fs.writeFile(file, stock);

    await addBlockedCerts(dir);

    expect(await fs.readFile(file, 'utf8')).toBe(`${stock}\n${all}\n`);
  });

  test('only appends the missing certs', async () => {
    const file = path.join(dir, 'blocked.certs');
    const [first, ...rest] = blockedCerts;
    await fs.writeFile(file, `${stock}\n${first?.toLowerCase()}\n`);

    await addBlockedCerts(dir);

    expect(await fs.readFile(file, 'utf8')).toBe(
      `${stock}\n${first?.toLowerCase()}\n${rest.join('\n')}\n`,
    );
  });

  test('keeps a complete blocked list unchanged', async () => {
    const file = path.join(dir, 'blocked.certs');
    const content = `${stock}\n${all}\n`;
    await fs.writeFile(file, content);

    await addBlockedCerts(dir);

    expect(await fs.readFile(file, 'utf8')).toBe(content);
  });

  test('appends to blacklisted.certs of older java', async () => {
    const file = path.join(dir, 'blacklisted.certs');
    await fs.writeFile(file, `${stock}\n`);

    await addBlockedCerts(dir);

    expect(await fs.readFile(file, 'utf8')).toBe(`${stock}\n${all}\n`);
    await expect(fs.stat(path.join(dir, 'blocked.certs'))).rejects.toThrow();
  });

  test('creates blocked.certs when java ships no blocked list', async () => {
    await addBlockedCerts(dir);

    expect(await fs.readFile(path.join(dir, 'blocked.certs'), 'utf8')).toBe(
      `Algorithm=SHA-256\n${all}\n`,
    );
  });
});
