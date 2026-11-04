import { z } from 'zod';

export const InstallToolType = z
  .enum(['gem', 'npm', 'pip'])
  .describe('the installer a dynamically installed tool is installed with');

export const ToolType = z
  .enum(['gem', 'npm', 'pip', 'dotnet'])
  .describe('the package manager installing the tool');

export const DistroCode = z
  .enum(['jammy', 'noble', 'resolute'])
  .describe('an Ubuntu release supported by containerbase, by codename');

export const Arch = z
  .enum(['amd64', 'arm64'])
  .describe('a CPU architecture supported by containerbase');

/**
 * Schema of a single entry of `tools.json`.
 *
 * Keep in sync with the `ToolMetadata` interface in `types.ts`, which is the
 * zod free version used by the default export.
 */
export const ToolMetadata = z.strictObject({
  // exact optionals, so the inferred type matches the zod free interface
  type: ToolType.exactOptional(),
  parent: z
    .string()
    .describe('the tool this tool depends on, eg. composer depends on php')
    .exactOptional(),
  deprecated: z
    .literal(true)
    .describe('deprecated tools should not be used any more')
    .exactOptional(),
  root: z
    .literal(true)
    .describe(
      'the tool can only be installed as root, so only at image build time',
    )
    .exactOptional(),
  minVersion: z
    .string()
    .describe(
      "the oldest version containerbase supports for the tool on the default distro, in the tool's versioning; tools without a known limit have none",
    )
    .exactOptional(),
  distroMinVersion: z
    .partialRecord(DistroCode, z.string())
    .describe(
      "the oldest version containerbase supports on an Ubuntu release, in the tool's versioning, keyed by codename; only for releases whose floor differs from minVersion, which is the floor on the default distro",
    )
    .exactOptional(),
});

/**
 * Schema of `tools.json`.
 *
 * The generated json schema lives in `data/tools.schema.json`.
 */
export const SupportedTools = z.strictObject({
  tools: z
    .record(z.string(), ToolMetadata)
    .describe('all supported tools, keyed by tool name'),
});
export type SupportedTools = z.infer<typeof SupportedTools>;
