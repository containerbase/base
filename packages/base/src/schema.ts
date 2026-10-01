import { z } from 'zod';

export const InstallToolType = z
  .enum(['gem', 'npm', 'pip'])
  .describe('the installer a dynamically installed tool is installed with');

/**
 * Schema of a single entry of `tools.json`.
 *
 * Keep in sync with the `ToolMetadata` interface in `types.ts`, which is the
 * zod free version used by the default export.
 */
export const ToolMetadata = z.strictObject({
  // exact optionals, so the inferred type matches the zod free interface
  type: InstallToolType.describe(
    'the installer used for this tool, only set for dynamically installed tools',
  ).exactOptional(),
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
