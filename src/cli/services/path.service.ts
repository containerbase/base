import fs from 'node:fs/promises';
import { join } from 'node:path';
import { env } from 'node:process';
import { inject, injectable } from 'inversify';
import { fileRights, logger, pathExists } from '../utils';
import { EnvService } from './env.service';

export interface FileOwnerConfig {
  /**
   * file or folder
   */
  path: string;
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

  async createDir(path: string, mode = 0o775): Promise<void> {
    await fs.mkdir(path);
    await this.setOwner({ path, mode });
  }

  async createToolPath(tool: string): Promise<string> {
    const toolPath = this.toolPath(tool);
    await fs.mkdir(toolPath);
    await fs.chmod(toolPath, 0o775);
    return toolPath;
  }

  async ensureToolPath(tool: string): Promise<string> {
    return (await this.findToolPath(tool)) ?? (await this.createToolPath(tool));
  }

  async createVersionedToolPath(
    tool: string,
    version: string,
  ): Promise<string> {
    const toolPath = this.versionedToolPath(tool, version);
    await fs.mkdir(toolPath);
    await fs.chmod(toolPath, this.envSvc.umask);
    return toolPath;
  }

  async findToolPath(tool: string): Promise<string | null> {
    const toolPath = this.toolPath(tool);

    if (await pathExists(toolPath, true)) {
      return toolPath;
    }
    return null;
  }

  async findVersionedToolPath(
    tool: string,
    version: string,
  ): Promise<string | null> {
    const versionedToolPath = this.versionedToolPath(tool, version);

    if (await pathExists(versionedToolPath, true)) {
      return versionedToolPath;
    }
    return null;
  }

  async fileExists(filePath: string): Promise<boolean> {
    return await pathExists(filePath);
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

    await fs.appendFile(this.envFile, content);
  }

  async exportPath(value: string): Promise<void> {
    env.PATH = `${value}:${env.PATH}`;
    await fs.appendFile(this.envFile, `export PATH=${value}:$PATH\n`);
  }

  async toolEnvExists(tool: string): Promise<boolean> {
    const file = join(this.toolPath(tool), 'env.sh');
    return await pathExists(file);
  }

  async resetToolEnv(tool: string): Promise<Promise<void>> {
    const file = join(this.toolPath(tool), 'env.sh');
    if (!(await pathExists(file))) {
      return;
    }

    await fs.rm(file, { force: true });
  }

  async exportToolEnvContent(tool: string, content: string): Promise<void> {
    const file = join(await this.ensureToolPath(tool), 'env.sh');
    await fs.appendFile(file, `\n${content.trim()}\n`);
    await this.setOwner({ path: file, mode: 0o644 });
  }

  async exportToolEnv(
    tool: string,
    values: Record<string, string>,
    nonRootOnly = false,
  ): Promise<void> {
    const file = join(await this.ensureToolPath(tool), 'env.sh');
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

    await fs.appendFile(file, content);
    await this.setOwner({ path: file, mode: 0o664 });
  }

  async exportToolPath(
    tool: string,
    value: string,
    toEnd = false,
  ): Promise<void> {
    const file = join(await this.ensureToolPath(tool), 'env.sh');

    if (toEnd) {
      env.PATH = `${env.PATH}:${value}`;
      await fs.appendFile(file, `export PATH=$PATH:${value}\n`);
    } else {
      env.PATH = `${value}:${env.PATH}`;
      await fs.appendFile(file, `export PATH=${value}:$PATH\n`);
    }

    await this.setOwner({ path: file, mode: 0o664 });
  }

  async setOwner({ path, mode = 0o775 }: FileOwnerConfig): Promise<void> {
    const s = await fs.stat(path);
    if ((s.mode & fileRights) !== mode) {
      logger.debug({ path, mode, s: s.mode & fileRights }, 'setting path mode');
      await fs.chmod(path, mode);
    }
    if (this.envSvc.isRoot && s.uid === 0) {
      await fs.chown(path, this.envSvc.userId, 0);
    }
  }

  /**
   * Write content to file and set permissions.
   * @param file path to file
   * @param content content to write
   * @param mode fille access mode
   */
  async writeFile(file: string, content: string, mode = 0o664): Promise<void> {
    await fs.writeFile(file, content);
    await this.setOwner({ path: file, mode });
  }
}
