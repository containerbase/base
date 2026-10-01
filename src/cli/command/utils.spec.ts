import { beforeEach, describe, expect, test, vi } from 'vitest';
import { getVersion, isToolIgnored } from './utils.ts';

describe('cli/command/utils', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_VERSION', undefined);
    vi.stubEnv('DEL_CLI_VERSION', undefined);
    vi.stubEnv('IGNORED_TOOLS', 'php,pnpm');
  });

  test('getVersion', () => {
    expect(getVersion('node')).toBeUndefined();
    vi.stubEnv('NODE_VERSION', '1.0.0');
    expect(getVersion('node')).toBe('1.0.0');
    vi.stubEnv('DEL_CLI_VERSION', '1.0.1');
    expect(getVersion('del-cli')).toBe('1.0.1');
  });

  test('isToolIgnored', async () => {
    expect(await isToolIgnored('node')).toBe(false);
    expect(await isToolIgnored('pnpm')).toBe(true);
    expect(await isToolIgnored('php')).toBe(true);
  });
});
