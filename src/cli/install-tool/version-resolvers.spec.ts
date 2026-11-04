import { codeBlock } from 'common-tags';
import { injectFromHierarchy, injectable } from 'inversify';
import { describe, expect, test } from 'vitest';
import { ToolVersionResolver } from './tool-version-resolver.ts';
import {
  createGenericVersionResolver,
  getVersionHelp,
} from './version-resolvers.ts';

@injectable()
@injectFromHierarchy()
class NoteLessVersionResolver extends ToolVersionResolver {
  readonly tool = 'noteless';

  /** Keeps the version. */
  resolve(version: string | undefined): Promise<string | undefined> {
    return Promise.resolve(version);
  }
}

describe('cli/install-tool/version-resolvers', () => {
  test('getVersionHelp', () => {
    expect(getVersionHelp()).toBe(codeBlock`
      Some tools accept partial versions:

      - \`android-sdk-cmdline-tools\`, \`bundler\`, \`checkov\`, \`cocoapods\`, \`composer\`, \`conan\`, \`copier\`, \`gradle\`, \`hashin\`, \`kas\`, \`maven\`, \`mise\`, \`node\`, \`nuget\`, \`pdm\`, \`php\`, \`pip-tools\`, \`pipenv\`, \`poetry\`, \`uv\`: A major or major.minor version installs the newest matching release.
      - \`corepack\`, \`npm\`, \`pnpm\`, \`yarn\`: A major or major.minor version installs the matching \`latest\` release, else the newest matching one.
      - \`java\`, \`java-jdk\`, \`java-jre\`: A major, major.minor or major.minor.patch version, like \`21\` or \`11.0\`, installs the newest matching release.

      Other tools resolve a missing version, \`latest\` or a major or major.minor version from the containerbase tool-versions data, any other version is used as is.
    `);
  });

  test.each([
    { type: 'gem' as const, tool: 'bundler' },
    { type: 'npm' as const, tool: 'pnpm' },
    { type: 'pip' as const, tool: 'poetry' },
  ])('createGenericVersionResolver $type', ({ type, tool }) => {
    const Resolver = createGenericVersionResolver(type, tool);

    expect(new Resolver().tool).toBe(tool);
  });

  test('getVersionHelp without version notes', () => {
    expect(getVersionHelp([NoteLessVersionResolver])).toBe('');
  });

  test('getVersionHelp lets a dedicated resolver without a note win', () => {
    // at runtime the dedicated resolver is used, so the generic note must not show
    expect(
      getVersionHelp([
        NoteLessVersionResolver,
        createGenericVersionResolver('pip', 'noteless'),
      ]),
    ).toBe('');
  });
});
