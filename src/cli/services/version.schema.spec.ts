import { describe, expect, test } from 'vitest';
import { InstalledTool } from './version.schema.ts';

describe('cli/services/version.schema', () => {
  const tool = { name: 'dummy', version: '1.0.0', versions: [] };

  test.each(['gem', 'npm', 'pip'])('accepts the %s type', (type) => {
    expect(InstalledTool.safeParse({ ...tool, type }).success).toBe(true);
  });

  test('rejects the dotnet type', () => {
    expect(InstalledTool.safeParse({ ...tool, type: 'dotnet' }).success).toBe(
      false,
    );
  });
});
