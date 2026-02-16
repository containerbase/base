import fs from 'node:fs/promises';
import { join } from 'node:path';
import { isNonEmptyStringAndNotWhitespace } from '@sindresorhus/is';
import { injectFromHierarchy, injectable } from 'inversify';
import { z } from 'zod';
import { BaseInstallService } from '../install-tool/base-install.service';
import { ToolVersionResolver } from '../install-tool/tool-version-resolver';

@injectable()
@injectFromHierarchy()
export class NugetInstallService extends BaseInstallService {
  readonly name = 'nuget';
  override parent = 'mono';

  override async install(version: string): Promise<void> {
    const baseUrl = `https://dist.nuget.org/win-x86-commandline/${version}/`;
    const filename = `${this.name}.exe`;

    const file = await this.http.download({
      url: `${baseUrl}${filename}`,
      fileName: `${filename}-v${version}`,
    });

    await this.pathSvc.ensureToolPath(this.name);

    const path = join(
      await this.pathSvc.createVersionedToolPath(this.name, version),
      'bin',
    );
    await fs.mkdir(path);
    const binary = join(path, filename);
    await fs.copyFile(file, binary);
    // create shell wrapper to be able to execute it with mono
    const wrapper = join(path, this.name);
    await fs.writeFile(wrapper, `#!/bin/sh\nexec mono "${binary}" "$@"\n`);
    await fs.chmod(wrapper, this.envSvc.umask);
  }

  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');

    await this.shellwrapper({ srcDir: src });
  }

  override async test(_version: string): Promise<void> {
    await this._spawn(this.name, ['help']);
  }
}

const NugetVersion = z.object({
  version: z.string(),
  stage: z.string().optional(),
});

const NugetTools = z.object({
  'nuget.exe': z.array(NugetVersion),
});

@injectable()
@injectFromHierarchy()
export class NugetVersionResolver extends ToolVersionResolver {
  readonly tool = 'nuget';

  async resolve(version: string | undefined): Promise<string | undefined> {
    if (!isNonEmptyStringAndNotWhitespace(version) || version === 'latest') {
      const meta = NugetTools.parse(
        await this.http.getJson('https://dist.nuget.org/tools.json'),
      );
      // we know that the latest version is the first entry, so search for first lts
      return meta['nuget.exe'].find((v) => v.stage === 'ReleasedAndBlessed')
        ?.version;
    }
    return version;
  }
}
