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
    return join(this.installDir, 'bin');
  }

  get cachePath(): string {
    return join(this.installDir, 'cache');
  }

  get envFile(): string {
    return join(this.envSvc.rootDir, 'usr/local/etc/env');
  }

  get homePath(): string {
    return join(this.installDir, 'home');
  }

  get installDir(): string {
    return join(this.envSvc.rootDir, 'opt/containerbase');
  }

  get sslPath(): string {
    return join(this.installDir, 'ssl');
  }

  get tmpDir(): string {
    return join(this.envSvc.rootDir, 'tmp');
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

  async exportEnv(
    values: Record<string, string>,
    nonRootOnly = false,
  ): Promise<void> {
    let content = '';

    if (nonRootOnly) {
      // eslint-disable-next-line no-template-curly-in-string
      content += 'if [ "${EUID}" != 0 ]; then\n';
    }

    for (const [key, value] of Object.entries(values)) {
      if (nonRootOnly === false) {
        env[key] = value;
      }
      content += `export ${key}=\${${key}-${value}}\n`;
    }

    if (nonRootOnly) {
      content += 'fi\n';
    }

    await appendFile(this.envFile, content);
  }

  async exportPath(value: string): Promise<void> {
    env.PATH = `${value}:${env.PATH}`;
    await appendFile(this.envFile, `export PATH=${value}:$PATH\n`);
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
    nonRootOnly = false,
  ): Promise<void> {
    const file = `${this.installDir}/env.d/${tool}.sh`;
    let content = '';

    if (nonRootOnly) {
      // eslint-disable-next-line no-template-curly-in-string
      content += 'if [ "${EUID}" != 0 ]; then\n';
    }

    for (const [key, value] of Object.entries(values)) {
      if (nonRootOnly === false) {
        env[key] = value;
      }
      content += `export ${key}=\${${key}-${value}}\n`;
    }

    if (nonRootOnly) {
      content += 'fi\n';
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
