import type { ClazzDecorator } from './types';

const knownV2Tools = new Set<string>();

/** Whether a v2 shell tool has its own service, see `v2Tool`. */
export function isKnownV2Tool(tool: string): boolean {
  return knownV2Tools.has(tool);
}

/** Whether a v2 shell tool has no own service and needs a generic one. */
export function isNotKnownV2Tool(tool: string): boolean {
  return !knownV2Tools.has(tool);
}

interface V2ToolInstallerService {
  prototype: { name: string };
}

/**
 * Class decorator which marks a v2 shell tool as having its own service, so
 * no generic one is registered for it.
 */
export function v2Tool(tool: string): ClazzDecorator<V2ToolInstallerService> {
  return <T extends V2ToolInstallerService>(target: T): T | void => {
    knownV2Tools.add(tool);

    return target;
  };
}
