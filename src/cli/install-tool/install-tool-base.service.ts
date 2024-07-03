import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { codeBlock } from 'common-tags';
import { injectable } from 'inversify';
import type { EnvService, PathService } from '../services';
import { NoPrepareTools } from '../tools';
import { isValid } from '../utils';

export interface ShellWrapperConfig {
  name?: string;
  srcDir: string;
  exports?: string;

  args?: string;
}

@injectable()
export abstract class InstallToolBaseService {
  abstract readonly name: string;

  constructor(
    protected readonly pathSvc: PathService,
    protected readonly envSvc: EnvService,
  ) {}

  abstract install(version: string): Promise<void>;

  async isInstalled(version: string): Promise<boolean> {
    return !!(await this.pathSvc.findVersionedToolPath(this.name, version));
  }

  async isPrepared(): Promise<boolean> {
    return null !== (await this.pathSvc.findToolPath(this.name));
  }

  abstract link(version: string): Promise<void>;

  needsPrepare(): boolean {
    return !NoPrepareTools.includes(this.name);
  }

  postInstall(_version: string): Promise<void> {
    return Promise.resolve();
  }

  test(_version: string): Promise<void> {
    return Promise.resolve();
  }

  toString(): string {
    return this.name;
  }

  validate(version: string): Promise<boolean> {
    return Promise.resolve(isValid(version));
  }

  protected async shellwrapper({
    args,
    name,
    srcDir,
    exports,
  }: ShellWrapperConfig): Promise<void> {
    const tgt = join(this.pathSvc.binDir, name ?? this.name);

    let content = codeBlock`
      #!/bin/bash

      if [[ -z "\${CONTAINERBASE_ENV+x}" ]]; then
        . ${this.pathSvc.envFile}
      fi
      `;

    if (exports) {
      content += `\nexport ${exports}`;
    }

    content += `\n${srcDir}/${name ?? this.name}`;
    if (args) {
      content += ` ${args}`;
    }
    content += ` "$@"\n`;

    await writeFile(tgt, content, { encoding: 'utf8' });
    await this.pathSvc.setOwner({ path: tgt });
  }
}
