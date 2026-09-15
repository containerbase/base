import fs from 'node:fs/promises';
import { beforeAll, describe, expect, test } from 'vitest';
import { z } from 'zod';
import { InstalledTools, VersionService } from '../services/index.ts';
import { testCli, testContainer } from '~test/di.ts';
import { StdoutMock } from '~test/mock.ts';
import { cachePath, ensurePaths } from '~test/path.ts';

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
    await versionSvc.addInstalled({ name: 'java-jdk', version: '21.0.12+7' });
    await versionSvc.setCurrent({
      name: 'node',
      tool: { name: 'node', version: '22.11.0' },
    });
    // java tools are linked under their `java` alias
    await versionSvc.setCurrent({
      name: 'java',
      tool: { name: 'java-jdk', version: '21.0.12+7' },
    });
    await versionSvc.setType('pnpm', 'npm');
  });

  test('lists tools', async () => {
    const stdout = new StdoutMock();

    expect(await cli.run(['list', 'tools'], { stdout })).toBe(0);
    expect(stdout.output).toBe(
      'java-jdk  21.0.12+7\n' +
        'node      22.11.0 (Other installed versions: 20.11.0)\n' +
        'pnpm      - (Other installed versions: 10.0.1)\n',
    );
  });

  test('resolves the current version of aliased tools', async () => {
    const stdout = new StdoutMock();

    expect(await cli.run(['list', 'tools', '--json'], { stdout })).toBe(0);
    expect(JSON.parse(stdout.output).tools).toContainEqual({
      name: 'java-jdk',
      version: '21.0.12+7',
      versions: [{ version: '21.0.12+7' }],
    });
  });

  test('lists tools as json', async () => {
    const stdout = new StdoutMock();

    expect(await cli.run(['list', 'tools', '--json'], { stdout })).toBe(0);
    expect(JSON.parse(stdout.output)).toEqual({
      tools: [
        {
          name: 'java-jdk',
          version: '21.0.12+7',
          versions: [{ version: '21.0.12+7' }],
        },
        {
          name: 'node',
          version: '22.11.0',
          versions: [{ version: '20.11.0' }, { version: '22.11.0' }],
        },
        {
          name: 'pnpm',
          version: null,
          versions: [
            {
              version: '10.0.1',
              parent: { name: 'node', version: '22.11.0' },
            },
          ],
          type: 'npm',
        },
      ],
    });
  });

  test('json output matches the published schema', async () => {
    const stdout = new StdoutMock();

    expect(await cli.run(['list', 'tools', '--json'], { stdout })).toBe(0);
    expect(() => InstalledTools.parse(JSON.parse(stdout.output))).not.toThrow();

    const schema = JSON.parse(
      await fs.readFile('docs/list-tools.schema.json', 'utf8'),
    );
    expect(schema).toEqual(z.toJSONSchema(InstalledTools));
  });

  test('writes json to file', async () => {
    const file = cachePath('tools.json');

    expect(await cli.run(['list', 'tools', '--json', '--out', file])).toBe(0);

    const content = await fs.readFile(file, 'utf8');
    // written without pretty printing
    expect(content.split('\n')).toHaveLength(2);
    expect(JSON.parse(content)).toHaveProperty('tools');
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
