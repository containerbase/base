import { mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { inject, injectable } from 'inversify';
import { EnvService } from './env.service';

@injectable()
export class PathService {
  constructor(@inject(EnvService) private envSvc: EnvService) {}

  get installDir(): string {
    return '/opt/containerbase';
  }

  get toolsPath(): string {
    return join(this.installDir, 'tools');
  }

  toolPath(tool: string): string {
    return join(this.toolsPath, tool);
  }

  async createToolPath(tool: string): Promise<string> {
    const toolPath = this.toolPath(tool);
    await mkdir(toolPath, { recursive: true, mode: 0o775 });
    return toolPath;
  }

  async findToolPath(tool: string): Promise<string | null> {
    const toolPath = this.toolPath(tool);

    if (
      await stat(toolPath)
        .then((s) => !s.isDirectory())
        .catch(() => true)
    ) {
      return null;
    }
    return toolPath;
  }
}
