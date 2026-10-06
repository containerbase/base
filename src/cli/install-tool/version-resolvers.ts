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
import { PoetryVersionResolver } from '../tools/python/poetry.ts';
import { CocoapodsVersionResolver } from '../tools/ruby/cocoapods.ts';
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
 * The resolvers of the tools `install-tool` maps to `install-npm`, those are
 * bound on demand when a version is resolved.
 */
const npmResolvers: readonly VersionResolverClass[] = Object.entries(
  ResolverMap,
)
  .filter(([, type]) => type === 'npm')
  .map(([tool]) => createNpmVersionResolver(tool));

/**
 * Builds the install-tool help text about tool specific versions from the
 * version notes of the resolvers. Tools with the same note are listed together.
 * @param resolvers - the resolvers to read the notes from
 * @returns the help text, or an empty string if no resolver has a note
 */
export function getVersionHelp(
  resolvers: readonly VersionResolverClass[] = [
    ...versionResolvers,
    ...npmResolvers,
  ],
): string {
  const notes = new Map<string, string[]>();
  for (const Resolver of resolvers) {
    const { tool, versionHelp } = new Resolver();
    if (!versionHelp) {
      continue;
    }
    const tools = notes.get(versionHelp) ?? [];
    tools.push(`\`${tool}\``);
    notes.set(versionHelp, tools);
  }

  if (!notes.size) {
    return '';
  }

  const lines = [...notes].map(
    ([note, tools]) => `- ${tools.join(', ')}: ${note}`,
  );
  return `Some tools accept partial versions:\n\n${lines.join('\n')}`;
}
