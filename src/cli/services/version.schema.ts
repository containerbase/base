import { z } from 'zod';
import { installToolTypes } from '../utils/types.ts';

export const Tool = z.object({
  name: z.string().describe('tool name'),
  version: z.string().describe('tool version'),
});
export type Tool = z.infer<typeof Tool>;

export const InstalledToolVersion = z.object({
  version: z.string().describe('installed version'),
  parent: Tool.describe(
    'the tool this version was installed for, eg. the node version a npm package was installed with',
  ).optional(),
});
export type InstalledToolVersion = z.infer<typeof InstalledToolVersion>;

export const InstalledTool = z.object({
  name: z.string().describe('tool name'),
  version: z
    .string()
    .nullable()
    .describe(`the currently linked version, null if the tool isn't linked`),
  versions: z
    .array(InstalledToolVersion)
    .describe('all installed versions, sorted ascending'),
  type: z
    .enum(installToolTypes)
    .describe('the installer type, only set for dynamically installed tools')
    .optional(),
});
export type InstalledTool = z.infer<typeof InstalledTool>;

/**
 * Output of `containerbase-cli list tools --json`.
 *
 * The generated json schema lives in `docs/list-tools.schema.json`.
 */
export const InstalledTools = z.object({
  tools: z.array(InstalledTool).describe('all installed tools, sorted by name'),
});
export type InstalledTools = z.infer<typeof InstalledTools>;
