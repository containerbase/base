import { env } from 'node:process';
import { beforeEach, describe, expect, test } from 'vitest';
import { getVersion, isToolIgnored } from './utils';

describe('cli/command/utils', () => {
  beforeEach(() => {
    delete env.NODE_VERSION;
    delete env.DEL_CLI_VERSION;
    delete env.IGNORED_TOOLS;
  });

  test('getVersion', () => {
    expect(getVersion('node')).toBeUndefined();
    env.NODE_VERSION = '1.0.0';
    expect(getVersion('node')).toBe('1.0.0');
    env.DEL_CLI_VERSION = '1.0.1';
    expect(getVersion('del-cli')).toBe('1.0.1');
  });

  test('isToolIgnored', () => {
    expect(isToolIgnored('node')).toBe(false);
    env.IGNORED_TOOLS = 'node,pnpm';
    expect(isToolIgnored('node')).toBe(true);
    expect(isToolIgnored('php')).toBe(false);
  });
});
