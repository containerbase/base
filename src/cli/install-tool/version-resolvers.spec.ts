import { codeBlock } from 'common-tags';
import { describe, expect, test } from 'vitest';
import { GradleVersionResolver } from '../tools/java/gradle.ts';
import { getVersionHelp } from './version-resolvers.ts';

describe('cli/install-tool/version-resolvers', () => {
  test('getVersionHelp', () => {
    expect(getVersionHelp()).toBe(codeBlock`
      Some tools accept partial versions:

      - \`java\`, \`java-jre\`, \`java-jdk\`: A major, major.minor or major.minor.patch version, like \`21\` or \`11.0\`, installs the newest matching release.
      - \`node\`: A major or major.minor version, like \`22\` or \`22.11\`, installs the newest matching release.
    `);
  });

  test('getVersionHelp without version notes', () => {
    expect(getVersionHelp([GradleVersionResolver])).toBe('');
  });
});
