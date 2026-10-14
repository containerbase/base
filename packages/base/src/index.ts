import { tools } from './data.ts';

export type {
  DistroCode,
  InstallToolType,
  ToolMetadata,
  ToolType,
} from './types.ts';

export { tools };

/**
 * A tool name `install-tool` accepts.
 */
export type ToolName = keyof typeof tools;

/**
 * All supported tool names, sorted alphabetically.
 */
export const toolNames = Object.keys(tools) as ToolName[];
