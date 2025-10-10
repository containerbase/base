import fs from 'node:fs/promises';
import { join } from 'node:path';
import { codeBlock } from 'common-tags';
import { bindingScopeValues, inject, injectable } from 'inversify';
import { pathExists, tool2path } from '../utils';
import { EnvService } from './env.service';
import { PathService } from './path.service';

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

  async shellwrapper(
    tool: string,
    { args, name, srcDir, exports, extraToolEnvs, body }: ShellWrapperConfig,
  ): Promise<void> {
    const tgt = join(this.pathSvc.binDir, name ?? tool);
    const src = (await pathExists(srcDir, 'file'))
      ? srcDir
      : `${srcDir}/${name ?? tool}`;

    const envs = [...(extraToolEnvs ?? []), tool].map(tool2path);
    let content = codeBlock`
        #!/bin/bash

        if [[ -z "\${CONTAINERBASE_ENV+x}" ]]; then
          . ${this.pathSvc.envFile}
        fi

        if [[ ! -f "${this.pathSvc.toolInitPath(tool)}" ]]; then
          # set logging to only warn and above to not interfere with tool output
          CONTAINERBASE_LOG_LEVEL=warn containerbase-cli init tool "${tool}"
        fi
        `;

    if (envs) {
      content +=
        '\n' +
        codeBlock`
        # load tool envs
        include () {
            local file=${this.pathSvc.toolsPath}/$1/env.sh
            [[ -f "$file" ]] && source "$file"
        }
      `;

      for (const t of envs) {
        content += `\ninclude ${t}`;
      }

      content += `\nunset include`;
    }

    if (exports) {
      content += `\nexport ${exports}`;
    }

    if (body) {
      content += `\n${body}`;
    }

    content += `\n${src}`;
    if (args) {
      content += ` ${args}`;
    }
    content += ` "$@"\n`;

    await fs.writeFile(tgt, content, { encoding: 'utf8' });
    await this.pathSvc.setOwner({ path: tgt });
  }
}
