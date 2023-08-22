import { env } from 'node:process';
import { beforeEach, describe, expect, test } from 'vitest';
import { getVersion } from './utils';

describe('utils', () => {
  beforeEach(() => {
    delete env.NODE_VERSION;
    delete env.DEL_CLI_VERSION;
  });

  test('getVersion', () => {
    expect(getVersion('node')).toBeUndefined();
    env.NODE_VERSION = '1.0.0';
    expect(getVersion('node')).toBe('1.0.0');
    env.DEL_CLI_VERSION = '1.0.1';
    expect(getVersion('del-cli')).toBe('1.0.1');
  });
});
