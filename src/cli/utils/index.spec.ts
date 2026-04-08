import { describe, expect, test, vi } from 'vitest';
import { cliMode } from './index.ts';

const procMocks = vi.hoisted(() => ({ argv0: '', env: {} }));
vi.mock('node:process', () => procMocks);

describe('cli/utils/index', () => {
  test('cliMode', async () => {
    expect(cliMode()).toBeNull();
    procMocks.argv0 = 'containerbase-cli';
    expect((await import('./index.ts')).cliMode()).toBe('containerbase-cli');
    procMocks.argv0 = 'install-gem';
    expect((await import('./index.ts')).cliMode()).toBe('install-gem');
    procMocks.argv0 = 'install-npm';
    expect((await import('./index.ts')).cliMode()).toBe('install-npm');
    procMocks.argv0 = 'install-pip';
    expect((await import('./index.ts')).cliMode()).toBe('install-pip');
    procMocks.argv0 = 'install-tool';
    expect((await import('./index.ts')).cliMode()).toBe('install-tool');
    procMocks.argv0 = 'prepare-tool';
    expect((await import('./index.ts')).cliMode()).toBe('prepare-tool');
    procMocks.argv0 = '/usr/bin/node';
    expect((await import('./index.ts')).cliMode()).toBe('containerbase-cli');
    procMocks.argv0 = '/bin/sh';
    expect((await import('./index.ts')).cliMode()).toBeNull();
  });
});
