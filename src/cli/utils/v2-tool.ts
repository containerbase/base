import type { ClazzDecorator } from './types';

const knownV2Tools = new Set<string>();

export function isKnownV2Tool(tool: string): boolean {
  return knownV2Tools.has(tool);
}
export function isNotKnownV2Tool(tool: string): boolean {
  return !knownV2Tools.has(tool);
}

interface V2ToolInstallerService {
  prototype: { name: string };
}

export function v2Tool(tool: string): ClazzDecorator<V2ToolInstallerService> {
  return <T extends V2ToolInstallerService>(target: T): T | void => {
    knownV2Tools.add(tool);

    return target;
  };
}
