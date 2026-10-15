import { tools } from './data.ts';
import type { DistroCode } from './types.ts';

export type {
  DistroCode,
  InstallToolType,
  ToolMetadata,
  ToolType,
} from './types.ts';

export { tools };

/**
 * The Ubuntu release the default containerbase image is built from, the
 * distro `minVersion` refers to.
 */
export const defaultDistro: DistroCode = 'noble';

/**
 * A tool name `install-tool` accepts.
 */
export type ToolName = keyof typeof tools;

/**
 * All supported tool names, sorted alphabetically.
 */
export const toolNames = Object.keys(tools) as ToolName[];
