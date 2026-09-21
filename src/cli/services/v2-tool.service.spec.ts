import fs from 'node:fs/promises';
import { beforeAll, describe, expect, test } from 'vitest';
import { V2ToolService } from './index.ts';
import { testContainer } from '~test/di.ts';
import { ensurePaths, rootPath } from '~test/path.ts';

const full = `
function prepare_tool () {
  echo prepare
}

function init_tool () {
  echo init
}

function post_install () {
  echo post
}

function uninstall_tool () {
  echo uninstall
}
`;

const minimal = `
function install_tool () {
  echo install
}
`;

describe('cli/services/v2-tool.service', () => {
  let svc!: V2ToolService;

  beforeAll(async () => {
    await ensurePaths('usr/local/containerbase/tools/v2');
    await fs.writeFile(
      rootPath('usr/local/containerbase/tools/v2/full.sh'),
      full,
    );
    await fs.writeFile(
      rootPath('usr/local/containerbase/tools/v2/minimal.sh'),
      minimal,
    );
    // not a shell script, so it is not a tool
    await fs.writeFile(rootPath('usr/local/containerbase/tools/v2/readme'), '');

    svc = await (await testContainer()).getAsync(V2ToolService);
  });

  test('reports the supported hooks', () => {
    expect(svc.hasPostinstall('full')).toBe(true);
    expect(svc.hasUninstall('full')).toBe(true);
    expect(svc.needsPrepare('full')).toBe(true);
    expect(svc.needsInitialize('full')).toBe(true);

    expect(svc.hasPostinstall('minimal')).toBe(false);
    expect(svc.hasUninstall('minimal')).toBe(false);
    expect(svc.needsPrepare('minimal')).toBe(false);
    expect(svc.needsInitialize('minimal')).toBe(false);
  });

  test.each([
    { method: 'hasPostinstall' as const },
    { method: 'hasUninstall' as const },
    { method: 'needsPrepare' as const },
    { method: 'needsInitialize' as const },
  ])('$method throws for an unknown tool', ({ method }) => {
    expect(() => svc[method]('unknown')).toThrow('tool not supported: unknown');
  });
});
