import fs from 'node:fs/promises';
import { join } from 'node:path';
import { bindingScopeValues, inject, injectable } from 'inversify';
import { fileContent, pathExists, tool2path } from '../utils/index.ts';
import { EnvService } from './env.service.ts';
import { PathService } from './path.service.ts';

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
}

@injectable(bindingScopeValues.Singleton)
export class LinkToolService {
  @inject(PathService)
  protected readonly pathSvc!: PathService;
  @inject(EnvService)
  protected readonly envSvc!: EnvService;

  private readonly _links: string[] = [];

  /*
   * Get the list of links created during the last shellwrapper() call
   */
  get links(): readonly string[] {
    return this._links.toSorted();
  }

  /**
   * Clear the list of links created during the last shellwrapper() call
   */
  clear(): void {
    this._links.length = 0;
  }

  async shellwrapper(
    tool: string,
    { args, name, srcDir, exports, extraToolEnvs, body }: ShellWrapperConfig,
  ): Promise<void> {
    this._links.push(name ?? tool);
    const tgt = join(this.pathSvc.binDir, name ?? tool);
    const src = (await pathExists(srcDir, 'file'))
      ? srcDir
      : `${srcDir}/${name ?? tool}`;

    const envs = [...(extraToolEnvs ?? []), tool].map(tool2path);
    let content = fileContent`
        #!/bin/bash

        if [[ -z "\${CONTAINERBASE_ENV+x}" ]]; then
          . ${this.pathSvc.envFile}
        fi

        if [[ ! -f "${this.pathSvc.toolInitPath(tool)}" ]]; then
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

    content += src;
    if (args) {
      content += ` ${args}`;
    }
    content += ` "$@"\n`;

    await fs.writeFile(tgt, content, { encoding: 'utf8' });
    await this.pathSvc.setOwner({ path: tgt });
  }

  async rm(name: string): Promise<void> {
    const tgt = join(this.pathSvc.binDir, name);
    if (await pathExists(tgt, 'file')) {
      await fs.rm(tgt);
    }
  }
}
