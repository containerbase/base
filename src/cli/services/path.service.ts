import { appendFile, chmod, chown, mkdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from 'node:process';
import { inject, injectable } from 'inversify';
import { fileExists, fileRights, logger } from '../utils';
import { EnvService } from './env.service';

export interface FileOwnerConfig {
  file: string;
  mode?: number;
}

@injectable()
export class PathService {
  get binDir(): string {
    return join(this.envSvc.rootDir, 'usr/local/bin');
  }

  get tmpDir(): string {
    return join(this.envSvc.rootDir, 'tmp');
  }

  get installDir(): string {
    return join(this.envSvc.rootDir, 'opt/containerbase');
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
    await mkdir(toolPath);
    await chmod(toolPath, 0o775);
    return toolPath;
  }

  async createVersionedToolPath(
    tool: string,
    version: string,
  ): Promise<string> {
    const toolPath = this.versionedToolPath(tool, version);
    await mkdir(toolPath);
    await chmod(toolPath, this.envSvc.umask);
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
    version: string,
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

  async fileExists(filePath: string): Promise<boolean> {
    return await fileExists(filePath);
  }

  toolPath(tool: string): string {
    return join(this.toolsPath, tool);
  }

  versionedToolPath(tool: string, version: string): string {
    return join(this.toolPath(tool), version);
  }

  async resetToolEnv(tool: string): Promise<Promise<void>> {
    const file = `${this.installDir}/env.d/${tool}.sh`;
    if (!(await fileExists(file))) {
      return;
    }

    await rm(file, { force: true });
  }

  async exportToolEnvContent(tool: string, content: string): Promise<void> {
    const file = `${this.installDir}/env.d/${tool}.sh`;
    await appendFile(file, content);
    await this.setOwner({ file, mode: 0o644 });
  }

  async exportToolEnv(
    tool: string,
    values: Record<string, string>,
  ): Promise<void> {
    const file = `${this.installDir}/env.d/${tool}.sh`;
    let content = '';

    for (const [key, value] of Object.entries(values)) {
      env[key] = value;
      content += `export ${key}=\${${key}-${value}}\n`;
    }

    await appendFile(file, content);
    await this.setOwner({ file, mode: 0o644 });
  }

  async exportToolPath(
    tool: string,
    value: string,
    toEnd = false,
  ): Promise<void> {
    const file = `${this.installDir}/env.d/${tool}.sh`;

    if (toEnd) {
      env.PATH = `${env.PATH}:${value}`;
      await appendFile(file, `export PATH=$PATH:${value}\n`);
    } else {
      env.PATH = `${value}:${env.PATH}`;
      await appendFile(file, `export PATH=${value}:$PATH\n`);
    }

    await this.setOwner({ file, mode: 0o644 });
  }

  async setOwner({ file, mode = 0o775 }: FileOwnerConfig): Promise<void> {
    const s = await stat(file);
    if ((s.mode & fileRights) !== mode) {
      logger.debug({ file, mode, s: s.mode & fileRights }, 'setting file mode');
      await chmod(file, mode);
    }
    if (this.envSvc.isRoot && s.uid === 0) {
      await chown(file, this.envSvc.userId, 0);
    }
  }
}
