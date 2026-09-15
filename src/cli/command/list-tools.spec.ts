import fs from 'node:fs/promises';
import { beforeAll, describe, expect, test } from 'vitest';
import { VersionService } from '../services/index.ts';
import { testCli, testContainer } from '~test/di.ts';
import { cachePath, ensurePaths } from '~test/path.ts';

function stdoutMock(): { write: (s: string) => boolean; output: () => string } {
  const chunks: string[] = [];
  return {
    write: (s: string) => {
      chunks.push(s);
      return true;
    },
    output: () => chunks.join(''),
  };
}

describe('cli/command/list-tools', () => {
  const cli = testCli('containerbase-cli');

  beforeAll(async () => {
    await ensurePaths(['opt/containerbase/data', 'opt/containerbase/versions']);

    const container = await testContainer();
    const versionSvc = await container.getAsync(VersionService);

    await versionSvc.addInstalled({ name: 'node', version: '20.11.0' });
    await versionSvc.addInstalled({ name: 'node', version: '22.11.0' });
    await versionSvc.addInstalled({
      name: 'pnpm',
      version: '10.0.1',
      parent: { name: 'node', version: '22.11.0' },
    });
    await versionSvc.setCurrent({
      name: 'node',
      tool: { name: 'node', version: '22.11.0' },
    });
    await versionSvc.setType('pnpm', 'npm');
  });

  test('lists tools', async () => {
    const stdout = stdoutMock();

    expect(await cli.run(['list', 'tools'], { stdout: stdout as never })).toBe(
      0,
    );
    expect(stdout.output()).toBe(
      'node  22.11.0 (20.11.0)\n' + 'pnpm  - (10.0.1)\n',
    );
  });

  test('lists tools as json', async () => {
    const stdout = stdoutMock();

    expect(
      await cli.run(['list', 'tools', '--json'], { stdout: stdout as never }),
    ).toBe(0);
    expect(JSON.parse(stdout.output())).toEqual({
      tools: [
        { name: 'node', version: '22.11.0', versions: ['20.11.0', '22.11.0'] },
        { name: 'pnpm', version: null, versions: ['10.0.1'], type: 'npm' },
      ],
    });
  });

  test('writes json to file', async () => {
    const file = cachePath('tools.json');

    expect(await cli.run(['list', 'tools', '--json', '--out', file])).toBe(0);
    expect(JSON.parse(await fs.readFile(file, 'utf8'))).toHaveProperty('tools');
  });

  test('fails on unwritable output file', async () => {
    expect(
      await cli.run([
        'list',
        'tools',
        '--out',
        cachePath('missing/tools.json'),
      ]),
    ).toBe(1);
  });
});
