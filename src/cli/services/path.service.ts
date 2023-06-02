import { mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { inject, injectable } from 'inversify';
import { EnvService } from './env.service';

@injectable()
export class PathService {
  get binDir(): string {
    return '/usr/local/bin';
  }

  get installDir(): string {
    return '/opt/containerbase';
  }

  get toolsPath(): string {
    return join(this.installDir, 'tools');
  }

  get versionPath(): string {
    return join(this.installDir, 'versions');
  }

  constructor(@inject(EnvService) private envSvc: EnvService) {}

  async createToolPath(tool: string): Promise<string> {
    const toolPath = this.toolPath(tool);
    await mkdir(toolPath, { recursive: true, mode: 0o775 });
    return toolPath;
  }

  async createVersionedToolPath(
    tool: string,
    version: string
  ): Promise<string> {
    const toolPath = this.versionedToolPath(tool, version);
    await mkdir(toolPath, { recursive: true, mode: this.envSvc.umask });
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

  async findVersionedToolPath(
    tool: string,
    version: string
  ): Promise<string | null> {
    const versionedToolPath = this.versionedToolPath(tool, version);

    if (
      await stat(versionedToolPath)
        .then((s) => !s.isDirectory())
        .catch(() => true)
    ) {
      return null;
    }
    return versionedToolPath;
  }

  toolPath(tool: string): string {
    return join(this.toolsPath, tool);
  }

  versionedToolPath(tool: string, version: string): string {
    return join(this.toolPath(tool), version);
  }
}
