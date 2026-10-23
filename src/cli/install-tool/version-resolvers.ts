import { NugetVersionResolver } from '../tools/dotnet/nuget.ts';
import { ResolverMap } from '../tools/index.ts';
import { AndroidSdkCmdlineToolsVersionResolver } from '../tools/java/android.ts';
import { GradleVersionResolver } from '../tools/java/gradle.ts';
import { MavenVersionResolver } from '../tools/java/maven.ts';
import {
  JavaJdkVersionResolver,
  JavaJreVersionResolver,
  JavaVersionResolver,
} from '../tools/java/resolver.ts';
import { MiseVersionResolver } from '../tools/mise.ts';
import {
  NodeVersionResolver,
  YarnVersionResolver,
  createNpmVersionResolver,
} from '../tools/node/resolver.ts';
import { ComposerVersionResolver } from '../tools/php/composer.ts';
import { PhpVersionResolver } from '../tools/php/index.ts';
import { ConanVersionResolver } from '../tools/python/conan.ts';
import { createPipVersionResolver } from '../tools/python/pip.ts';
import { PoetryVersionResolver } from '../tools/python/poetry.ts';
import { CocoapodsVersionResolver } from '../tools/ruby/cocoapods.ts';
import { createGemVersionResolver } from '../tools/ruby/utils.ts';
import type { InstallToolType } from '../utils/index.ts';
import type { ToolVersionResolver } from './tool-version-resolver.ts';

export type VersionResolverClass = new () => ToolVersionResolver;

/** All tool version resolvers, bound in the resolve container. */
export const versionResolvers: readonly VersionResolverClass[] = [
  AndroidSdkCmdlineToolsVersionResolver,
  CocoapodsVersionResolver,
  ConanVersionResolver,
  ComposerVersionResolver,
  GradleVersionResolver,
  JavaVersionResolver,
  JavaJreVersionResolver,
  JavaJdkVersionResolver,
  MavenVersionResolver,
  MiseVersionResolver,
  NodeVersionResolver,
  NugetVersionResolver,
  PhpVersionResolver,
  PoetryVersionResolver,
  YarnVersionResolver,
];

/**
 * Creates the generic version resolver of a tool installed with
 * `install-gem`, `install-npm` or `install-pip`.
 * @param type - the install type of the tool
 * @param tool - the tool and package name
 */
export function createGenericVersionResolver(
  type: InstallToolType,
  tool: string,
): VersionResolverClass {
  switch (type) {
    case 'gem':
      return createGemVersionResolver(tool);
    case 'npm':
      return createNpmVersionResolver(tool);
    case 'pip':
      return createPipVersionResolver(tool);
  }
}

/**
 * The resolvers of the tools `install-tool` maps to `install-gem`,
 * `install-npm` or `install-pip`, those are bound on demand when a version is
 * resolved.
 */
const dynamicResolvers: readonly VersionResolverClass[] = Object.entries(
  ResolverMap,
).map(([tool, type]) => createGenericVersionResolver(type, tool));

/**
 * Builds the install-tool help text about tool specific versions from the
 * version notes of the resolvers. Tools with the same note are listed together.
 * @param resolvers - the resolvers to read the notes from
 * @returns the help text, or an empty string if no resolver has a note
 */
export function getVersionHelp(
  resolvers: readonly VersionResolverClass[] = [
    ...versionResolvers,
    ...dynamicResolvers,
  ],
): string {
  const notes = new Map<string, string[]>();
  const seen = new Set<string>();
  for (const Resolver of resolvers) {
    const { tool, versionHelp } = new Resolver();
    // the first resolver of a tool wins, like at runtime, even without a note
    if (seen.has(tool)) {
      continue;
    }
    seen.add(tool);
    if (!versionHelp) {
      continue;
    }
    const tools = notes.get(versionHelp) ?? [];
    tools.push(tool);
    notes.set(versionHelp, tools);
  }

  if (!notes.size) {
    return '';
  }

  // sorted, so the help does not depend on the order of the resolvers
  const lines = [...notes]
    .map(([note, tools]) => ({
      note,
      tools: tools.sort((a, b) => a.localeCompare(b, 'en')),
    }))
    .sort((a, b) => a.tools[0]!.localeCompare(b.tools[0]!, 'en'))
    .map(
      ({ note, tools }) =>
        `- ${tools.map((tool) => `\`${tool}\``).join(', ')}: ${note}`,
    );
  return `Some tools accept partial versions:\n\n${lines.join('\n')}`;
}
