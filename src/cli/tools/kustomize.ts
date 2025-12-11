import fs from 'node:fs/promises';
import path from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service';

@injectable()
@injectFromHierarchy()
export class KustomizeInstallService extends BaseInstallService {
  readonly name = 'kustomize';

  override async install(version: string): Promise<void> {
    const name = this.name;
    const filename = `${name}_v${version}_linux_${this.envSvc.arch}.tar.gz`;
    const baseUrl = `https://github.com/kubernetes-sigs/${name}/releases/download/${name}%2Fv${version}/`;

    const checksumFile = await this.http.download({
      url: `${baseUrl}checksums.txt`,
      fileName: `${name}_v${version}_checksums.txt`,
    });
    const expectedChecksum = (await fs.readFile(checksumFile, 'utf-8'))
      .split('\n')
      .find((l) => l.includes(filename))
      ?.split(' ')[0];

    const file = await this.http.download({
      url: `${baseUrl}${filename}`,
      checksumType: 'sha256',
      expectedChecksum,
    });
    await this.pathSvc.ensureToolPath(this.name);
    const cwd = path.join(
      await this.pathSvc.createVersionedToolPath(this.name, version),
      'bin',
    );
    await fs.mkdir(cwd);
    await this.compress.extract({ file, cwd });
  }

  override async link(version: string): Promise<void> {
    const src = path.join(
      this.pathSvc.versionedToolPath(this.name, version),
      'bin',
    );
    await this.shellwrapper({ srcDir: src });
  }

  override async test(_version: string): Promise<void> {
    await this._spawn(this.name, ['version']);
  }
}
