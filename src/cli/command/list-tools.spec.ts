import fs from 'node:fs/promises';
import { beforeAll, describe, expect, test, vi } from 'vitest';
import { z } from 'zod';
import {
  InstalledTools,
  VersionService,
  createContainer,
} from '../services/index.ts';
import { testCli } from '~test/di.ts';
import { StdoutMock } from '~test/mock.ts';
import { cachePath, ensurePaths } from '~test/path.ts';

describe('cli/command/list-tools', () => {
  const cli = testCli('containerbase-cli');

  beforeAll(async () => {
    await ensurePaths(['opt/containerbase/data', 'opt/containerbase/versions']);
  });

  test('handles an empty tool list', async () => {
    const stdout = new StdoutMock();

    expect(await cli.run(['list', 'tools'], { stdout })).toBe(0);
    expect(stdout.output).toBe('No tools installed.\n');
  });

  test('fails when something other than an error is thrown', async () => {
    vi.spyOn(VersionService.prototype, 'listInstalled').mockRejectedValueOnce(
      'oops',
    );

    expect(await cli.run(['list', 'tools'], { stdout: new StdoutMock() })).toBe(
      1,
    );
  });

  // the command resolves its services from the root container, so seed through
  // it too, otherwise the command wouldn't see the tools added here
  async function seed(): Promise<void> {
    const container = createContainer();
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
  }

  describe('with installed tools', () => {
    beforeAll(seed);

    test('lists tools', async () => {
      const stdout = new StdoutMock();

      expect(await cli.run(['list', 'tools'], { stdout })).toBe(0);
      expect(stdout.output).toBe(
        'NAME      VERSION    OTHER VERSIONS\n' +
          'java-jdk  21.0.12+7\n' +
          'node      22.11.0    20.11.0\n' +
          'pnpm      -          10.0.1\n',
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

    test('published json schema is up to date', async () => {
      // regenerate with `pnpm schema` when this fails
      const schema = JSON.parse(
        await fs.readFile('docs/list-tools.schema.json', 'utf8'),
      );
      expect(schema).toEqual(z.toJSONSchema(InstalledTools));
    });

    test('json output matches the schema', async () => {
      const stdout = new StdoutMock();

      expect(await cli.run(['list', 'tools', '--json'], { stdout })).toBe(0);

      const output: unknown = JSON.parse(stdout.output);
      // parsing strips unknown keys, so an equal result means no extra fields
      expect(InstalledTools.parse(output)).toEqual(output);
    });

    test('writes json to file', async () => {
      const file = cachePath('tools.json');

      expect(await cli.run(['list', 'tools', '--json', '--out', file])).toBe(0);

      const content = await fs.readFile(file, 'utf8');
      // written without pretty printing
      expect(content.split('\n')).toHaveLength(2);

      const output: unknown = JSON.parse(content);
      expect(InstalledTools.parse(output)).toEqual(output);
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
});
