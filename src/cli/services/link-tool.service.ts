import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pid } from 'node:process';
import { bindingScopeValues, inject, injectable } from 'inversify';
import { fileContent, logger, pathExists, tool2path } from '../utils/index.ts';
import { EnvService } from './env.service.ts';
import { PathService } from './path.service.ts';
import type { Tool } from './version.schema.ts';

export interface ShellWrapperConfig {
  name?: string | undefined;
  srcDir: string;
  exports?: string | undefined;

  args?: string | undefined;

  /**
   * Which extra tool envs to load.
   * Eg. load php env before composer env.
   */
  extraToolEnvs?: string[] | undefined;

  /**
   * extra content to be added to the shell wrapper
   */
  body?: string | undefined;

  /**
   * Runs the tool via `exec -a "$0"`, so it sees the name it was invoked with
   * (e.g. a mise shim symlink). Off by default, because tools like Python and
   * Swift locate their install from argv0.
   */
  keepArgv0?: boolean | undefined;
}

/**
 * The tool version an install links, set by the install for the install
 * services.
 */
export interface LinkContext {
  /** The tool name. */
  tool: string;
  /** The tool version. */
  version: string;
  /**
   * The folder of the version, including the parent version segment for
   * tools installed per parent version, eg. `tools/renovate/39.0.0/22.11.0`.
   */
  dir: string;
  /**
   * Only writes the per-version wrappers, no shims and pointers, to restore
   * the files of a version without changing what any command runs.
   */
  restore?: boolean;
}

/** The folder of the per-version wrappers, below the folder of the version. */
const wrappersDir = '.wrappers';

/** The target of the link, `null` when the path is no link. */
function readLink(path: string): Promise<string | null> {
  return fs.readlink(path).catch(() => null);
}

/** The content of the file, `null` when it can't be read. */
function readText(path: string): Promise<string | null> {
  return fs.readFile(path, 'utf8').catch(() => null);
}

@injectable(bindingScopeValues.Singleton)
export class LinkToolService {
  @inject(PathService)
  protected readonly pathSvc!: PathService;
  @inject(EnvService)
  protected readonly envSvc!: EnvService;

  private readonly _links: string[] = [];
  /** The per-version wrapper of every command linked since the last `clear`. */
  private readonly _wrapped = new Map<string, string>();
  private _context: LinkContext | null = null;

  /**
   * Get the list of links created during the last shellwrapper() call
   */
  get links(): readonly string[] {
    return this._links.toSorted();
  }

  /**
   * The tool version the running install links, `null` outside of an install
   * or for the legacy shell tools.
   */
  get context(): LinkContext | null {
    return this._context;
  }

  /**
   * Clear the list of links created during the last shellwrapper() call and
   * the link context.
   */
  clear(): void {
    this._links.length = 0;
    this._wrapped.clear();
    this._context = null;
  }

  /** Sets the tool version the following links belong to. */
  setContext(context: LinkContext): void {
    this._context = context;
  }

  /**
   * Resets only the link context, so later links are written as legacy ones
   * again. The recorded links and wrappers are kept, see `clear`.
   */
  resetContext(): void {
    this._context = null;
  }

  /**
   * Links a tool binary for the install services. It writes the wrapper into
   * the folder of the linked version, only when its content differs, and the
   * static shim into the global bin folder, see `shim`. The pointer of the
   * command to the wrapper is only written by `point`, together with the
   * links store, so a command keeps running the version which linked it last.
   * In restore mode only the wrapper is written.
   *
   * Without a link context it writes the full wrapper like
   * `legacyShellwrapper`.
   */
  async shellwrapper(tool: string, config: ShellWrapperConfig): Promise<void> {
    const context = this._context;
    if (!context) {
      return await this.legacyShellwrapper(tool, config);
    }

    const name = config.name ?? tool;
    const wrapper = join(context.dir, wrappersDir, name);
    this._links.push(name);
    this._wrapped.set(name, wrapper);

    const content = await this.wrapperContent(tool, config);
    if ((await readText(wrapper)) !== content) {
      await this.pathSvc.createDir(dirname(wrapper));
      await this.pathSvc.writeFile(wrapper, content);
    }

    if (!context.restore) {
      await this.writeShim(name);
    }
  }

  /**
   * Writes the full shell wrapper into the global bin folder, for the v1 and
   * v2 shell tools, the ipc server and `link-tool`. It loads the containerbase
   * env, initializes the tool on first use, sources the tool envs and finally
   * executes the tool. An existing wrapper or symlink is replaced, never
   * written through, and a stale pointer of the command is removed.
   */
  async legacyShellwrapper(
    tool: string,
    config: ShellWrapperConfig,
  ): Promise<void> {
    const name = config.name ?? tool;
    this._links.push(name);
    const tgt = join(this.pathSvc.binDir, name);
    const content = await this.wrapperContent(tool, config);

    // a symlink left by `symlink()` would be followed and its target replaced
    await this.removeStalePointer(name);
    await fs.rm(tgt, { force: true });
    await fs.writeFile(tgt, content, { encoding: 'utf8' });
    await this.pathSvc.setOwner({ path: tgt });
  }

  /**
   * Links a tool binary into the global bin folder with a plain symlink
   * instead of a shell wrapper, for binaries which need no containerbase env.
   * An existing wrapper or link is replaced, and a stale pointer of the
   * command is removed.
   */
  async symlink(
    tool: string,
    { name, srcDir }: Pick<ShellWrapperConfig, 'name' | 'srcDir'>,
  ): Promise<void> {
    const file = name ?? tool;
    this._links.push(file);
    const tgt = join(this.pathSvc.binDir, file);
    await this.removeStalePointer(file);
    await fs.rm(tgt, { force: true });
    await fs.symlink(join(srcDir, file), tgt);
  }

  /**
   * Points the command at the per-version wrapper written for it since the
   * last `clear`, replacing its previous pointer. Commands without such a
   * wrapper, eg. the ones linked by `symlink`, are left alone. An unchanged
   * pointer is not written again.
   */
  async point(name: string): Promise<void> {
    const wrapper = this._wrapped.get(name);
    if (wrapper) {
      await this.writePointer(name, wrapper);
    }
  }

  /**
   * Recreates the pointer of the command from the per-version wrapper of the
   * tool version, which must exist for one of the parent versions, in order,
   * or without a parent.
   *
   * @returns whether the wrapper exists, so the pointer was written
   */
  async restorePointer(
    name: string,
    { name: tool, version }: Tool,
    parentVersions: readonly string[],
  ): Promise<boolean> {
    const dir = this.pathSvc.versionedToolPath(tool, version);
    for (const parent of [...parentVersions, '']) {
      const wrapper = join(dir, parent, wrappersDir, name);
      if (await pathExists(wrapper, 'file')) {
        await this.writePointer(name, wrapper);
        return true;
      }
    }
    return false;
  }

  /**
   * Removes the shim, wrapper or symlink of the command, if it exists, also a
   * symlink whose target is already gone, and its pointer.
   */
  async rm(name: string): Promise<void> {
    await fs.rm(this.pointerPath(name), { force: true });
    const tgt = join(this.pathSvc.binDir, name);
    const stats = await fs.lstat(tgt).catch(() => null);
    if (stats?.isFile() || stats?.isSymbolicLink()) {
      await fs.rm(tgt);
    }
  }

  /**
   * Removes a pointer a legacy link replaces. A missing pointer is fine, and
   * so is one in a folder which can't be written, eg. when only `bin` is
   * writable: the link then keeps its full wrapper, which wins over the
   * pointer, as `bin` isn't a shim any more.
   */
  private async removeStalePointer(name: string): Promise<void> {
    try {
      await fs.rm(this.pointerPath(name), { force: true });
    } catch (err) {
      const { code } = err as NodeJS.ErrnoException;
      if (code !== 'EROFS' && code !== 'EACCES') {
        throw err;
      }
      logger.debug({ err, name }, 'cannot remove the pointer');
    }
  }

  /** Path to `/opt/containerbase/links/<name>`, the pointer of the command. */
  private pointerPath(name: string): string {
    return join(this.pathSvc.linksPath, name);
  }

  /**
   * The static shim of the command, which is the same for all commands apart
   * from the name. It sources the wrapper the pointer links to, so a call
   * still starts one bash, and `$0` and the arguments stay the shim's. A
   * missing or dangling pointer runs `containerbase-cli ensure` first, which
   * never writes to stdout and fails fast when it runs a nested shim.
   */
  private shim(name: string): string {
    const pointer = this.pointerPath(name);
    const cli = join(this.envSvc.rootDir, 'usr/local/sbin/containerbase-cli');
    return fileContent`
      #!/bin/bash
      if [[ ! -f ${pointer} ]]; then
        [[ -z "\${CONTAINERBASE_ENSURE}" ]] || exit 127
        CONTAINERBASE_ENSURE=1 CONTAINERBASE_LOG_LEVEL=warn ${cli} ensure ${name} </dev/null >&2 || exit
      fi
      . ${pointer}
    `;
  }

  /**
   * Writes the shim of the command into the global bin folder, replacing
   * whatever is there, unless it already is the shim.
   */
  private async writeShim(name: string): Promise<void> {
    const tgt = join(this.pathSvc.binDir, name);
    const content = this.shim(name);
    if ((await readText(tgt)) === content) {
      return;
    }
    await fs.rm(tgt, { force: true });
    await fs.writeFile(tgt, content, { encoding: 'utf8' });
    await this.pathSvc.setOwner({ path: tgt });
  }

  /**
   * Links the pointer of the command to the wrapper. The new link replaces the
   * old one at once, so a call never sees a missing pointer. The temp link has
   * a unique name and is removed again when the replacement fails. An
   * unchanged pointer is left as is.
   */
  private async writePointer(name: string, wrapper: string): Promise<void> {
    const pointer = this.pointerPath(name);
    if ((await readLink(pointer)) === wrapper) {
      return;
    }
    // a temp link of its own, so no other call or leftover is ever touched
    const tmp = `${pointer}.${pid}.${randomBytes(4).toString('hex')}`;
    try {
      await fs.symlink(wrapper, tmp);
      await fs.rename(tmp, pointer);
    } catch (err) {
      await fs.rm(tmp, { force: true });
      throw err;
    }
  }

  /**
   * The content of the shell wrapper which puts a tool on the path. It loads
   * the containerbase env, initializes the tool on first use, sources the tool
   * envs and finally executes the tool.
   */
  private async wrapperContent(
    tool: string,
    {
      args,
      name,
      srcDir,
      exports,
      extraToolEnvs,
      body,
      keepArgv0,
    }: ShellWrapperConfig,
  ): Promise<string> {
    const src = (await pathExists(srcDir, 'file'))
      ? srcDir
      : `${srcDir}/${name ?? tool}`;

    const envs = [...(extraToolEnvs ?? []), tool].map(tool2path);
    // goes through the default temp folder, so a missing link to a configured
    // `CONTAINERBASE_TMP_DIR` also triggers the init, which recreates the link
    const initMarker = join(
      this.pathSvc.defaultTmpDir,
      'tool.init.d',
      tool2path(tool),
    );
    let content = fileContent`
        #!/bin/bash

        if [[ -z "\${CONTAINERBASE_ENV+x}" ]]; then
          . ${this.pathSvc.envFile}
        fi

        if [[ ! -f "${initMarker}" ]]; then
          # set logging to only warn and above to not interfere with tool output
          CONTAINERBASE_LOG_LEVEL=warn containerbase-cli init tool "${tool}"
        fi
        # load tool envs
        include () {
            local file=${this.pathSvc.toolsPath}/$1/env.sh
            [[ -f "$file" ]] && source "$file"
        }
        `;

    // `envs` always holds at least the tool itself
    for (const t of envs) {
      content += `include ${t}\n`;
    }

    content += `unset include\n`;

    if (exports) {
      content += `export ${exports}\n`;
    }

    if (body) {
      content += `${body}\n`;
    }

    content += keepArgv0 ? `exec -a "$0" ${src}` : src;
    if (args) {
      content += ` ${args}`;
    }
    content += ` "$@"\n`;
    return content;
  }
}
