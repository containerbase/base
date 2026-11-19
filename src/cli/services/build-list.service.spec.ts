import fs from 'node:fs/promises';
import { codeBlock } from 'common-tags';
import type { Container } from 'inversify';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { logger } from '../utils/index.ts';
import { BuildListService, PathService } from './index.ts';
import { testContainer } from '~test/di.ts';
import { ensurePaths } from '~test/path.ts';

describe('cli/services/build-list.service', () => {
  let child!: Container;
  let svc!: BuildListService;
  let pathSvc!: PathService;

  beforeAll(async () => {
    await ensurePaths(['opt/containerbase', 'var/lib/containerbase']);
  });

  beforeEach(async () => {
    child = await testContainer();
    svc = await child.getAsync(BuildListService);
    pathSvc = await child.getAsync(PathService);
    await fs.rm(pathSvc.toolInstPath, { force: true });
    await fs.rm(pathSvc.volumeToolInstPath, { force: true });
  });

  test('paths', () => {
    expect(pathSvc.toolInstPath).toBe(`${pathSvc.varPath}/tool.inst`);
    expect(pathSvc.volumeToolInstPath).toBe(`${pathSvc.installDir}/.tool.inst`);
  });

  test('a missing list is empty', async () => {
    expect(await svc.read()).toEqual([]);
  });

  test('records installs and links in the list and its copy', async () => {
    await svc.record({ type: 'tool', tool: 'node', version: '22.0.0' }, [
      'node',
      'npm',
    ]);
    await svc.record(
      {
        type: 'npm',
        tool: 'renovate',
        version: '39.0.0',
        parent: { name: 'node', version: '22.0.0' },
      },
      ['renovate'],
    );

    const expected = `${codeBlock`
      i tool node 22.0.0
      c node node 22.0.0
      l node node 22.0.0
      l npm node 22.0.0
      i npm renovate 39.0.0 node 22.0.0
      c renovate renovate 39.0.0 node 22.0.0
      l renovate renovate 39.0.0
    `}\n`;
    expect(await fs.readFile(pathSvc.toolInstPath, 'utf8')).toBe(expected);
    expect(await fs.readFile(pathSvc.volumeToolInstPath, 'utf8')).toBe(
      expected,
    );
    expect(await svc.read(pathSvc.volumeToolInstPath)).toEqual([
      { kind: 'i', type: 'tool', tool: 'node', version: '22.0.0' },
      { kind: 'c', alias: 'node', tool: 'node', version: '22.0.0' },
      { kind: 'l', command: 'node', tool: 'node', version: '22.0.0' },
      { kind: 'l', command: 'npm', tool: 'node', version: '22.0.0' },
      {
        kind: 'i',
        type: 'npm',
        tool: 'renovate',
        version: '39.0.0',
        parent: { name: 'node', version: '22.0.0' },
      },
      {
        kind: 'c',
        alias: 'renovate',
        tool: 'renovate',
        version: '39.0.0',
        parent: { name: 'node', version: '22.0.0' },
      },
      {
        kind: 'l',
        command: 'renovate',
        tool: 'renovate',
        version: '39.0.0',
      },
    ]);
  });

  test('a recorded version moves to the end, becomes current and keeps its other parents', async () => {
    const renovate = (parent: string) => ({
      type: 'npm' as const,
      tool: 'renovate',
      version: '39.0.0',
      parent: { name: 'node', version: parent },
    });
    await svc.record({ type: 'tool', tool: 'node', version: '22.0.0' }, [
      'node',
    ]);
    await svc.record(renovate('22.0.0'), ['renovate']);
    await svc.record(renovate('24.0.0'), ['renovate']);
    // the current version of node again
    await svc.record({ type: 'tool', tool: 'node', version: '22.0.0' }, [
      'node',
      'npm',
    ]);

    expect(await fs.readFile(pathSvc.toolInstPath, 'utf8')).toBe(
      `${codeBlock`
        i npm renovate 39.0.0 node 22.0.0
        i npm renovate 39.0.0 node 24.0.0
        c renovate renovate 39.0.0 node 24.0.0
        l renovate renovate 39.0.0
        i tool node 22.0.0
        c node node 22.0.0
        l node node 22.0.0
        l npm node 22.0.0
      `}\n`,
    );
  });

  test('a later link of a command replaces the older one', async () => {
    await svc.record({ type: 'tool', tool: 'node', version: '20.0.0' }, [
      'node',
      'npm',
      'npx',
    ]);
    await svc.record({ type: 'tool', tool: 'node', version: '22.0.0' }, [
      'node',
      'npm',
    ]);

    expect(await fs.readFile(pathSvc.toolInstPath, 'utf8')).toBe(
      `${codeBlock`
        i tool node 20.0.0
        l npx node 20.0.0
        i tool node 22.0.0
        c node node 22.0.0
        l node node 22.0.0
        l npm node 22.0.0
      `}\n`,
    );
  });

  test('one current version per alias', async () => {
    await svc.record(
      { type: 'tool', tool: 'java-jdk', version: '21.0.0' },
      ['java'],
      'java',
    );
    await svc.record(
      { type: 'tool', tool: 'java-jre', version: '17.0.0' },
      ['java'],
      'java',
    );

    expect(await fs.readFile(pathSvc.toolInstPath, 'utf8')).toBe(
      `${codeBlock`
        i tool java-jdk 21.0.0
        i tool java-jre 17.0.0
        c java java-jre 17.0.0
        l java java-jre 17.0.0
      `}\n`,
    );
  });

  test('remove drops the version with its links', async () => {
    await svc.record({ type: 'tool', tool: 'node', version: '22.0.0' }, [
      'node',
    ]);
    await svc.record({ type: 'tool', tool: 'node', version: '24.0.0' }, [
      'node',
    ]);

    await svc.remove('node', '22.0.0');

    expect(await fs.readFile(pathSvc.toolInstPath, 'utf8')).toBe(
      `${codeBlock`
        i tool node 24.0.0
        c node node 24.0.0
        l node node 24.0.0
      `}\n`,
    );

    await svc.remove('node', '24.0.0');

    expect(await fs.readFile(pathSvc.toolInstPath, 'utf8')).toBe('');
    expect(await fs.readFile(pathSvc.volumeToolInstPath, 'utf8')).toBe('');
  });

  test('remove of the current version leaves no current version and no links', async () => {
    const node = (version: string) => ({
      type: 'tool' as const,
      tool: 'node',
      version,
    });
    await svc.record(node('20.0.0'), ['node', 'npm', 'npx']);
    await svc.record(node('22.0.0'), ['node', 'npm', 'npx']);

    await svc.remove('node', '22.0.0');

    expect(await fs.readFile(pathSvc.toolInstPath, 'utf8')).toBe(
      `i tool node 20.0.0\n`,
    );
  });

  test('skips malformed lines', async () => {
    await fs.writeFile(
      pathSvc.toolInstPath,
      `\n${codeBlock`
        i tool node 22.0.0
        i tool node
        i unknown node 22.0.0
        i npm renovate 39.0.0 node
        i tool a 1.0.0 b 2.0.0 c
        l node node 22.0.0 extra
        l node node
        c node node
        c node node 22.0.0 extra
        c node node 22.0.0 b
        x something
        l npm node 22.0.0
        c node node 22.0.0
        c renovate renovate 39.0.0 node 22.0.0
      `}\n\n`,
    );

    expect(await svc.read()).toEqual([
      { kind: 'i', type: 'tool', tool: 'node', version: '22.0.0' },
      { kind: 'l', command: 'npm', tool: 'node', version: '22.0.0' },
      { kind: 'c', alias: 'node', tool: 'node', version: '22.0.0' },
      {
        kind: 'c',
        alias: 'renovate',
        tool: 'renovate',
        version: '39.0.0',
        parent: { name: 'node', version: '22.0.0' },
      },
    ]);
  });

  test('renameTools renames the tools on every line', async () => {
    const list = `${codeBlock`
      i tool node 24.0.0
      c node node 24.0.0
      l node node 24.0.0
      i npm del-cli 8.0.1 node 24.0.0
      c del-cli del-cli 8.0.1 node 24.0.0
      l del del-cli 8.0.1
    `}\n`;
    await fs.writeFile(pathSvc.toolInstPath, list);

    await svc.renameTools(new Map([['del-cli', 'npm+del-cli']]));

    const expected = `${codeBlock`
      i tool node 24.0.0
      c node node 24.0.0
      l node node 24.0.0
      i npm npm+del-cli 8.0.1 node 24.0.0
      c npm+del-cli npm+del-cli 8.0.1 node 24.0.0
      l del npm+del-cli 8.0.1
    `}\n`;
    expect(await fs.readFile(pathSvc.toolInstPath, 'utf8')).toBe(expected);
    expect(await fs.readFile(pathSvc.volumeToolInstPath, 'utf8')).toBe(
      expected,
    );
  });

  test('renameTools writes no list without the tools', async () => {
    const write = vi.spyOn(fs, 'writeFile');

    await svc.renameTools(new Map([['del-cli', 'npm+del-cli']]));

    expect(write).not.toHaveBeenCalled();
    expect(await svc.read()).toEqual([]);
  });

  test('changed compares the list of the image with the copy', async () => {
    // no list in the image
    expect(await svc.changed()).toBe(false);
    await fs.writeFile(pathSvc.volumeToolInstPath, 'i tool node 22.0.0\n');
    expect(await svc.changed()).toBe(false);

    // a new volume
    await fs.writeFile(pathSvc.toolInstPath, 'i tool node 22.0.0\n');
    await fs.rm(pathSvc.volumeToolInstPath);
    expect(await svc.changed()).toBe(true);

    // an older volume
    await fs.writeFile(pathSvc.volumeToolInstPath, 'i tool node 20.0.0\n');
    expect(await svc.changed()).toBe(true);

    // the same list
    await fs.writeFile(pathSvc.volumeToolInstPath, 'i tool node 22.0.0\n');
    expect(await svc.changed()).toBe(false);
  });

  test('copyToVolume only writes the copy', async () => {
    await fs.writeFile(pathSvc.toolInstPath, 'i tool node 22.0.0\n');
    const write = vi.spyOn(fs, 'writeFile');

    await svc.copyToVolume();

    expect(await fs.readFile(pathSvc.volumeToolInstPath, 'utf8')).toBe(
      'i tool node 22.0.0\n',
    );
    expect(write).toHaveBeenCalledExactlyOnceWith(
      pathSvc.volumeToolInstPath,
      'i tool node 22.0.0\n',
    );
    expect(await svc.changed()).toBe(false);
  });

  test('copyToVolume only warns when the copy cannot be written', async () => {
    await fs.writeFile(pathSvc.toolInstPath, 'i tool node 22.0.0\n');
    const err = new Error('EROFS');
    vi.spyOn(fs, 'writeFile').mockRejectedValueOnce(err);

    await expect(svc.copyToVolume()).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledWith(
      { err },
      'cannot copy the build-time tool list',
    );
  });

  describe('an unreadable list', () => {
    const err = Object.assign(new Error('EACCES'), { code: 'EACCES' });

    beforeEach(async () => {
      await fs.writeFile(pathSvc.toolInstPath, 'i tool node 22.0.0\n');
    });

    test('read throws', async () => {
      vi.spyOn(fs, 'readFile').mockRejectedValueOnce(err);

      await expect(svc.read()).rejects.toThrow('EACCES');
    });

    test('record keeps the list and only warns', async () => {
      vi.spyOn(fs, 'readFile').mockRejectedValueOnce(err);

      await expect(
        svc.record({ type: 'tool', tool: 'node', version: '24.0.0' }, []),
      ).resolves.toBeUndefined();

      expect(await fs.readFile(pathSvc.toolInstPath, 'utf8')).toBe(
        'i tool node 22.0.0\n',
      );
      expect(logger.warn).toHaveBeenCalledWith(
        { err },
        'cannot read the build-time tool list',
      );
    });

    test('remove keeps the list and only warns', async () => {
      vi.spyOn(fs, 'readFile').mockRejectedValueOnce(err);

      await expect(svc.remove('node', '22.0.0')).resolves.toBeUndefined();

      expect(await fs.readFile(pathSvc.toolInstPath, 'utf8')).toBe(
        'i tool node 22.0.0\n',
      );
      expect(logger.warn).toHaveBeenCalledWith(
        { err },
        'cannot read the build-time tool list',
      );
    });
  });

  test('only warns when the list cannot be written', async () => {
    const err = new Error('EROFS');
    vi.spyOn(fs, 'writeFile').mockRejectedValueOnce(err);

    await expect(
      svc.record({ type: 'tool', tool: 'node', version: '22.0.0' }, []),
    ).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledWith(
      { err },
      'cannot write the build-time tool list',
    );
  });
});
