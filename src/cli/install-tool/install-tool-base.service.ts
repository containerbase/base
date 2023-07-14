import { chmod, chown, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { injectable } from 'inversify';
import type { EnvService, PathService } from '../services';
import { fileRights, isValid, logger } from '../utils';

export interface ShellWrapperConfig {
  name?: string;
  srcDir: string;
  exports?: string;
}

export interface FileOwnerConfig {
  file: string;
  mode?: number;
}

@injectable()
export abstract class InstallToolBaseService {
  abstract readonly name: string;

  constructor(
    protected readonly pathSvc: PathService,
    protected envSvc: EnvService
  ) {}

  abstract install(version: string): Promise<void>;

  async isInstalled(version: string): Promise<boolean> {
    return !!(await this.pathSvc.findVersionedToolPath(this.name, version));
  }

  abstract link(version: string): Promise<void>;

  needsPrepare(): boolean {
    return true;
  }

  test(_version: string): Promise<void> {
    return Promise.resolve();
  }

  toString(): string {
    return this.name;
  }

  validate(version: string): boolean {
    return isValid(version);
  }

  protected async shellwrapper({
    name,
    srcDir,
    exports,
  }: ShellWrapperConfig): Promise<void> {
    const tgt = join(this.pathSvc.binDir, name ?? this.name);

    let content = `#!/bin/bash

    if [[ -z "\${CONTAINERBASE_ENV+x}" ]]; then
      . $ENV_FILE
    fi
    `;

    if (exports) {
      content += `export ${exports}\n`;
    }

    content += `${srcDir}/${name ?? this.name} "$@"\n`;

    await writeFile(tgt, content, { encoding: 'utf8' });
    await this.setOwner({ file: tgt });
  }

  protected async setOwner({
    file,
    mode = 509,
  }: FileOwnerConfig): Promise<void> {
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
