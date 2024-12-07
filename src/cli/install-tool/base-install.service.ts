import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { codeBlock } from 'common-tags';
import { injectable } from 'inversify';
import type { EnvService, PathService } from '../services';
import { NoInitTools, NoPrepareTools } from '../tools';
import { isValid, tool2path } from '../utils';

export interface ShellWrapperConfig {
  name?: string;
  srcDir: string;
  exports?: string;

  args?: string;

  /**
   * Which extra tool envs to load.
   * Eg. load php env before composer env.
   */
  extraToolEnvs?: string[];
}

@injectable()
export abstract class BaseInstallService {
  abstract readonly name: string;

  constructor(
    protected readonly pathSvc: PathService,
    protected readonly envSvc: EnvService,
  ) {}

  abstract install(version: string): Promise<void>;

  async isInstalled(version: string): Promise<boolean> {
    return !!(await this.pathSvc.findVersionedToolPath(this.name, version));
  }

  async isInitialized(): Promise<boolean> {
    return await this.pathSvc.isInitialized(this.name);
  }

  async isPrepared(): Promise<boolean> {
    return await this.pathSvc.isPrepared(this.name);
  }

  abstract link(version: string): Promise<void>;

  needsInitialize(): boolean {
    return !NoInitTools.includes(this.name);
  }

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
    extraToolEnvs,
  }: ShellWrapperConfig): Promise<void> {
    const tgt = join(this.pathSvc.binDir, name ?? this.name);

    const envs = [...(extraToolEnvs ?? []), this.name].map(tool2path);
    let content = codeBlock`
      #!/bin/bash

      if [[ -z "\${CONTAINERBASE_ENV+x}" ]]; then
        . ${this.pathSvc.envFile}
      fi

      if [[ ! -f "${this.pathSvc.toolInitPath(this.name)}" ]]; then
        # set logging to only warn and above to not interfere with tool output
        CONTAINERBASE_LOG_LEVEL=warn containerbase-cli init tool "${this.name}"
      fi

      # load tool envs
      for n in ${envs.join(' ')}; do
        if [[ -f "${this.pathSvc.toolsPath}/\${n}/env.sh" ]]; then
          . "${this.pathSvc.toolsPath}/\${n}/env.sh"
        fi
      done
      unset n
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
