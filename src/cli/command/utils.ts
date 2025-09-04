import { env } from 'node:process';
import { EnvService, createContainer } from '../services';

export function getVersion(tool: string): string | undefined {
  return env[tool.replace('-', '_').toUpperCase() + '_VERSION'];
}

export async function isToolIgnored(tool: string): Promise<boolean> {
  const container = createContainer();
  return (await container.getAsync(EnvService)).isToolIgnored(tool);
}
