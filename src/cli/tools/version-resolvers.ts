import type { Container } from 'inversify';
import { ToolVersionResolverService } from '../services/tool-version-resolver.service.ts';
import {
  TOOL_VERSION_RESOLVER,
  type ToolVersionResolver,
} from '../services/tool-version-resolver.ts';
import type { InstallToolType } from '../utils/index.ts';
import { NugetVersionResolver } from './dotnet/nuget.ts';
import { ResolverMap } from './index.ts';
import { AndroidSdkCmdlineToolsVersionResolver } from './java/android.ts';
import { GradleVersionResolver } from './java/gradle.ts';
import { MavenVersionResolver } from './java/maven.ts';
import {
  JavaJdkVersionResolver,
  JavaJreVersionResolver,
  JavaVersionResolver,
} from './java/resolver.ts';
import { MiseVersionResolver } from './mise.ts';
import {
  NodeVersionResolver,
  YarnVersionResolver,
  createNpmVersionResolver,
} from './node/resolver.ts';
import { ComposerVersionResolver } from './php/composer.ts';
import { PhpVersionResolver } from './php/index.ts';
import { ConanVersionResolver } from './python/conan.ts';
import { createPipVersionResolver } from './python/pip.ts';
import { PoetryVersionResolver } from './python/poetry.ts';
import { CocoapodsVersionResolver } from './ruby/cocoapods.ts';
import { createGemVersionResolver } from './ruby/utils.ts';

export type VersionResolverClass = new () => ToolVersionResolver;

/** All tool version resolvers, see {@link bindVersionResolvers}. */
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
 * Binds the {@link ToolVersionResolverService} and all tool version resolvers
 * in a container.
 */
export function bindVersionResolvers(container: Container): void {
  container.bind(ToolVersionResolverService).toSelf();
  for (const resolver of versionResolvers) {
    container.bind(TOOL_VERSION_RESOLVER).to(resolver);
  }
}

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

/** The help note on the versions of the tools without their own note. */
const dataVersionHelp =
  'Other tools resolve a missing version, `latest` or a major or major.minor version from the containerbase tool-versions data, any other version is used as is.';

/**
 * Builds the install-tool help text about tool specific versions from the
 * version notes of the resolvers, followed by the resolution of the other
 * tools from the tool-versions data. Tools with the same note are listed
 * together.
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
  return `Some tools accept partial versions:\n\n${lines.join('\n')}\n\n${dataVersionHelp}`;
}
