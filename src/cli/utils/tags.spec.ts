import { describe, expect, test } from 'vitest';
import { fileContent } from './tags.ts';

describe('cli/utils/tags', () => {
  test('strips the indentation and keeps the trailing newline', () => {
    const name = 'containerbase';

    expect(fileContent`
      Types: deb
      Suites: ${name}
    `).toBe('Types: deb\nSuites: containerbase\n');
  });

  test('works without a leading newline', () => {
    expect(fileContent`Types: deb`).toBe('Types: deb\n');
  });
});
