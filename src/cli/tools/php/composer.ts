import fs from 'node:fs/promises';
import { join } from 'node:path';
import { isNonEmptyStringAndNotWhitespace } from '@sindresorhus/is';
import { execa } from 'execa';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../../install-tool/base-install.service';
import { ToolVersionResolver } from '../../install-tool/tool-version-resolver';

@injectable()
@injectFromHierarchy()
export class ComposerInstallService extends BaseInstallService {
  readonly name = 'composer';
  override readonly parent = 'ruby';

  override async install(version: string): Promise<void> {
    const name = this.name;
    const filename = `${name}-${version}.tar.xz`;
    const url = `https://github.com/containerbase/${name}-prebuild/releases/download/${version}/${filename}`;

    const checksumFile = await this.http.download({ url: `${url}.sha512` });
    const expectedChecksum = (await fs.readFile(checksumFile, 'utf-8')).trim();
    const file = await this.http.download({
      url,
      checksumType: 'sha512',
      expectedChecksum,
    });

    const path = await this.pathSvc.ensureToolPath(this.name);
    await this.compress.extract({ file, cwd: path });
  }

  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');
    await this.shellwrapper({ srcDir: src });
  }

  override async test(_version: string): Promise<void> {
    await execa('composer', ['--version'], {
      stdio: ['inherit', 'inherit', 1],
    });
  }
}

@injectable()
@injectFromHierarchy()
export class ComposerVersionResolver extends ToolVersionResolver {
  readonly tool = 'composer';

  async resolve(version: string | undefined): Promise<string | undefined> {
    if (!isNonEmptyStringAndNotWhitespace(version) || version === 'latest') {
      return await this.http.get(
        `https://github.com/containerbase/${this.tool}-prebuild/releases/latest/download/version`,
      );
    }
    return version;
  }
}
