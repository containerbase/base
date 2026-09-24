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
export const ToolMetadata = z.object({
  type: InstallToolType.describe(
    'the installer used for this tool, only set for dynamically installed tools',
  ).optional(),
  parent: z
    .string()
    .describe('the tool this tool depends on, eg. composer depends on php')
    .optional(),
  deprecated: z
    .literal(true)
    .describe('deprecated tools should not be used any more')
    .optional(),
});

/**
 * Schema of `tools.json`.
 *
 * The generated json schema lives in `data/tools.schema.json`.
 */
export const SupportedTools = z.object({
  tools: z
    .record(z.string(), ToolMetadata)
    .describe('all supported tools, keyed by tool name'),
});
export type SupportedTools = z.infer<typeof SupportedTools>;
