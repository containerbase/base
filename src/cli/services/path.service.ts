import fs from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { env } from 'node:process';
import { isNonEmptyStringAndNotWhitespace } from '@sindresorhus/is';
import { inject, injectable } from 'inversify';
import { fileRights, logger, pathExists, tool2path } from '../utils';
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
  /**
   * Path to `/tmp/containerbase/tool.init.d`.
   */
  private get _toolInitPath(): string {
    return join(this.tmpDir, 'tool.init.d');
  }
  /**
   * Path to `/var/lib/containerbase/tool.prep.d`.
   */
  private get _toolPrepPath(): string {
    return join(this.varPath, 'tool.prep.d');
  }

  /**
   * Path to `/opt/containerbase/bin`.
   */
  get binDir(): string {
    return join(this.installDir, 'bin');
  }

  /**
   * Path to `/tmp/containerbase/cache`.
   */
  get cachePath(): string {
    return join(this.tmpDir, 'cache');
  }

  get envFile(): string {
    return join(this.envSvc.rootDir, 'usr/local/etc/env');
  }

  /**
   * Path to `/opt/containerbase`.
   */
  get installDir(): string {
    return join(this.envSvc.rootDir, 'opt/containerbase');
  }

  /**
   * Path to `/opt/containerbase/ssl`.
   */
  get sslPath(): string {
    return join(this.installDir, 'ssl');
  }

  /**
   * Path to `/tmp/containerbase`.
   */
  get tmpDir(): string {
    return join(this.envSvc.tmpDir, 'containerbase');
  }

  /**
   * Path to `/opt/containerbase/tools`.
   */
  get toolsPath(): string {
    return join(this.installDir, 'tools');
  }

  /**
   * Path to `/usr/local/containerbase`.
   */
  get usrPath(): string {
    return join(this.envSvc.rootDir, 'usr/local/containerbase');
  }

  /**
   * Path to `/var/lib/containerbase`.
   */
  get varPath(): string {
    return join(this.envSvc.rootDir, 'var/lib/containerbase');
  }

  /**
   * Path to `/opt/containerbase/versions`.
   */
  get versionPath(): string {
    return join(this.installDir, 'versions');
  }

  constructor(@inject(EnvService) private envSvc: EnvService) {}

  async createDir(path: string, mode = 0o775): Promise<void> {
    if (await pathExists(path)) {
      return;
    }
    const parent = dirname(path);
    if (!(await pathExists(parent))) {
      await this.createDir(parent, 0o775);
    }
    logger.debug({ path }, 'creating dir');
    await fs.mkdir(path);
    await this.setOwner({ path, mode });
  }
  async createToolPath(tool: string): Promise<string> {
    const toolPath = this.toolPath(tool);
    await this.createDir(toolPath);
    return toolPath;
  }

  async createVersionedToolPath(
    tool: string,
    version: string,
  ): Promise<string> {
    const toolPath = this.versionedToolPath(tool, version);
    await this.createDir(toolPath, this.envSvc.umask);
    return toolPath;
  }

  async ensureBasePaths(): Promise<void> {
    if (!(await pathExists(this.varPath, 'dir'))) {
      throw new Error('System not initialized for containerbase');
    }
    await this.createDir(this._toolPrepPath);
    await this.createDir(this.toolsPath);
    await this.createDir(this.versionPath);
    await this.createDir(this.binDir);
    await this.createDir(this.sslPath);
    await this.createDir(this._toolInitPath);
    await this.createDir(join(this.tmpDir, 'cache', '.cache'));
    await this.createDir(join(this.tmpDir, 'cache', '.config'));
    await this.createDir(join(this.tmpDir, 'cache', '.local'));
  }

  async ensureToolPath(tool: string): Promise<string> {
    return (await this.findToolPath(tool)) ?? (await this.createToolPath(tool));
  }

  async findToolPath(tool: string): Promise<string | null> {
    const toolPath = this.toolPath(tool);

    if (await pathExists(toolPath, 'dir')) {
      return toolPath;
    }
    return null;
  }

  async findVersionedToolPath(
    tool: string,
    version: string,
  ): Promise<string | null> {
    const versionedToolPath = this.versionedToolPath(tool, version);

    if (await pathExists(versionedToolPath, 'dir')) {
      return versionedToolPath;
    }
    return null;
  }

  async findLegacyTools(): Promise<string[]> {
    const tools = await fs.readdir(join(this.usrPath, 'tools/v2'));
    return tools
      .filter((t) => t.endsWith('.sh'))
      .map((t) => t.substring(0, t.length - 3));
  }

  async findPreparedTools(): Promise<string[]> {
    const file = join(this.varPath, 'tool.prep');

    if (!(await this.fileExists(file))) {
      return [];
    }

    return (await fs.readFile(file, 'utf-8'))
      .split('\n')
      .filter(isNonEmptyStringAndNotWhitespace);
  }

  async fileExists(filePath: string): Promise<boolean> {
    return await pathExists(filePath, 'file');
  }

  async isInitialized(tool: string): Promise<boolean> {
    return await this.fileExists(this.toolInitPath(tool));
  }

  async isPrepared(tool: string): Promise<boolean> {
    return await this.fileExists(this.toolPreparePath(tool));
  }

  async isLegacyTool(tool: string, v1 = false): Promise<boolean> {
    let exists = await pathExists(join(this.usrPath, 'tools/v2', `${tool}.sh`));
    if (!exists && v1) {
      exists = await pathExists(join(this.usrPath, 'tools', `${tool}.sh`));
    }
    return exists;
  }

  async setInitialized(tool: string): Promise<void> {
    await fs.writeFile(this.toolInitPath(tool), '');
  }

  async setPrepared(tool: string): Promise<void> {
    await fs.writeFile(this.toolPreparePath(tool), '');
    await fs.appendFile(join(this.varPath, 'tool.prep'), `${tool}\n`);
  }

  toolInitPath(tool: string): string {
    return join(this._toolInitPath, tool2path(tool));
  }

  toolPath(tool: string): string {
    return join(this.toolsPath, tool2path(tool));
  }

  toolPreparePath(tool: string): string {
    return join(this._toolPrepPath, tool2path(tool));
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

    await this.writeFile(file, content);
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
