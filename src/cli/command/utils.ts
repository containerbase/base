import { env } from 'node:process';
import { EnvService, rootContainer } from '../services';

export function getVersion(tool: string): string | undefined {
  return env[tool.replace('-', '_').toUpperCase() + '_VERSION'];
}

export function isToolIgnored(tool: string): boolean {
  const container = rootContainer.createChild();
  return container.get(EnvService).isToolIgnored(tool);
}
