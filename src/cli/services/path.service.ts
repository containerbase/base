import fs from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { env } from 'node:process';
import { isNonEmptyStringAndNotWhitespace } from '@sindresorhus/is';
import { bindingScopeValues, inject, injectable } from 'inversify';
import { fileRights, logger, pathExists, tool2path } from '../utils/index.ts';
import { EnvService } from './env.service.ts';

export interface FileOwnerConfig {
  /**
   * file or folder
   */
  path: string;
  mode?: number;
}

@injectable(bindingScopeValues.Singleton)
export class PathService {
  @inject(EnvService)
  private readonly envSvc!: EnvService;

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

  /**
   * Path to `/opt/containerbase/data`.
   */
  get dataPath(): string {
    return join(this.installDir, 'data');
  }

  /**
   * Path to `/usr/local/etc/env`, the global env file.
   */
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

  /**
   * Creates a folder and its missing parents, owned by the configured user.
   * An existing folder is left as is.
   */
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

  /** Creates the tool path and returns it. */
  async createToolPath(tool: string): Promise<string> {
    const toolPath = this.toolPath(tool);
    await this.createDir(toolPath);
    return toolPath;
  }

  /** Creates the versioned tool path with the configured umask and returns it. */
  async createVersionedToolPath(
    tool: string,
    version: string,
  ): Promise<string> {
    const toolPath = this.versionedToolPath(tool, version);
    await this.createDir(toolPath, this.envSvc.umask);
    return toolPath;
  }

  /**
   * Creates the containerbase folders below the install, var and temp paths.
   *
   * @throws when the image was not set up for containerbase
   */
  async ensureBasePaths(): Promise<void> {
    if (!(await pathExists(this.varPath, 'dir'))) {
      throw new Error('System not initialized for containerbase');
    }
    await this.createDir(this._toolPrepPath);
    await this.createDir(this.dataPath);
    await this.createDir(this.toolsPath);
    await this.createDir(this.versionPath);
    await this.createDir(this.binDir);
    await this.createDir(this.sslPath);
    await this.createDir(this._toolInitPath);
    await this.createDir(join(this.tmpDir, 'cache', '.cache'));
    await this.createDir(join(this.tmpDir, 'cache', '.config'));
    await this.createDir(join(this.tmpDir, 'cache', '.local', 'share'));
  }

  /** Returns the tool path, creating it when missing. */
  async ensureToolPath(tool: string): Promise<string> {
    return (await this.findToolPath(tool)) ?? (await this.createToolPath(tool));
  }

  /** Returns the tool path when it exists, else `null`. */
  async findToolPath(tool: string): Promise<string | null> {
    const toolPath = this.toolPath(tool);

    if (await pathExists(toolPath, 'dir')) {
      return toolPath;
    }
    return null;
  }

  /** Returns the versioned tool path when it exists, else `null`. */
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

  /** Returns the names of the v2 shell tools. */
  async findLegacyTools(): Promise<string[]> {
    const tools = await fs.readdir(join(this.usrPath, 'tools/v2'));
    return tools
      .filter((t) => t.endsWith('.sh'))
      .map((t) => t.substring(0, t.length - 3));
  }

  /** Returns the names of the tools prepared in this image. */
  async findPreparedTools(): Promise<string[]> {
    const file = join(this.varPath, 'tool.prep');

    if (!(await this.fileExists(file))) {
      return [];
    }

    return (await fs.readFile(file, 'utf-8'))
      .split('\n')
      .filter(isNonEmptyStringAndNotWhitespace);
  }

  /** Whether the path exists and is a file. */
  async fileExists(filePath: string): Promise<boolean> {
    return await pathExists(filePath, 'file');
  }

  /** Whether the tool was initialized in this container. */
  async isInitialized(tool: string): Promise<boolean> {
    return await this.fileExists(this.toolInitPath(tool));
  }

  /** Whether the tool was prepared in this image. */
  async isPrepared(tool: string): Promise<boolean> {
    return await this.fileExists(this.toolPreparePath(tool));
  }

  /** Whether the tool is a v2 shell tool, or with `v1` also a v1 one. */
  async isLegacyTool(tool: string, v1 = false): Promise<boolean> {
    let exists = await pathExists(join(this.usrPath, 'tools/v2', `${tool}.sh`));
    if (!exists && v1) {
      exists = await pathExists(join(this.usrPath, 'tools', `${tool}.sh`));
    }
    return exists;
  }

  /** Marks the tool as initialized in this container. */
  async setInitialized(tool: string): Promise<void> {
    const path = this.toolInitPath(tool);
    await fs.writeFile(path, '');
    await this.setOwner({ path });
  }

  /** Marks the tool as prepared and adds it to the list of prepared tools. */
  async setPrepared(tool: string): Promise<void> {
    await fs.writeFile(this.toolPreparePath(tool), '');
    await fs.appendFile(join(this.varPath, 'tool.prep'), `${tool}\n`);
  }

  /** Path of the tool's initialized marker file. */
  toolInitPath(tool: string): string {
    return join(this._toolInitPath, tool2path(tool));
  }

  /** Path to `/opt/containerbase/tools/<tool>`. */
  toolPath(tool: string): string {
    return join(this.toolsPath, tool2path(tool));
  }

  /** Path of the tool's prepared marker file. */
  toolPreparePath(tool: string): string {
    return join(this._toolPrepPath, tool2path(tool));
  }

  /** Path to `/opt/containerbase/tools/<tool>/<version>`. */
  versionedToolPath(tool: string, version: string): string {
    return join(this.toolPath(tool), version);
  }

  /**
   * Exports the variables to the global env file and sets them in the current
   * process. The env file keeps values that are already set when it is
   * sourced. With `nonRootOnly` they only apply to non-root users and are not
   * set in the current process.
   */
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

  /** Prepends the folder to `PATH` in the global env file and the process. */
  async exportPath(value: string): Promise<void> {
    env.PATH = `${value}:${env.PATH}`;
    await fs.appendFile(this.envFile, `export PATH=${value}:$PATH\n`);
  }

  /** Whether the tool has an `env.sh`. */
  async toolEnvExists(tool: string): Promise<boolean> {
    const file = join(this.toolPath(tool), 'env.sh');
    return await pathExists(file);
  }

  /** Removes the tool's `env.sh`, if any. */
  async resetToolEnv(tool: string): Promise<Promise<void>> {
    const file = join(this.toolPath(tool), 'env.sh');
    if (!(await pathExists(file))) {
      return;
    }

    await fs.rm(file, { force: true });
  }

  /**
   * Appends a block to the tool env, `content` should end with a newline, eg.
   * by using the `fileContent` tag.
   */
  async exportToolEnvContent(tool: string, content: string): Promise<void> {
    const file = join(await this.ensureToolPath(tool), 'env.sh');
    await fs.appendFile(file, `\n${content}`);
    await this.setOwner({ path: file, mode: 0o644 });
  }

  /**
   * Writes the variables to the tool's `env.sh` and sets them in the current
   * process. The `env.sh` keeps values that are already set when it is
   * sourced. With `nonRootOnly` they only apply to non-root users and are not
   * set in the current process.
   */
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

  /**
   * Adds the folder to `PATH` in the tool's `env.sh` and the current process,
   * in front or with `toEnd` at the end.
   */
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

  /**
   * Sets the mode of the path, and when running as root gives the configured
   * user ownership of root owned paths.
   */
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
