import { z } from 'zod';
import { toolNames } from './index.ts';

export * from './schema.ts';
export * from './tool-versions-format.ts';
export * from './tool-versions-schema.ts';

/**
 * Enum of all tool names supported by the containerbase version this package
 * was released with.
 */
export const ToolName = z.enum(toolNames);
