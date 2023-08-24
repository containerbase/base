import { chmod, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execa } from 'execa';
import { inject, injectable } from 'inversify';
import { InstallToolBaseService } from '../../install-tool/install-tool-base.service';
import { EnvService, PathService, VersionService } from '../../services';
import { logger, parse } from '../../utils';

const defaultRegistry = 'https://rubygems.org/';

@injectable()
export abstract class InstallRubyBaseService extends InstallToolBaseService {
  constructor(
    @inject(EnvService) envSvc: EnvService,
    @inject(PathService) pathSvc: PathService,
    @inject(VersionService) protected versionSvc: VersionService,
  ) {
    super(pathSvc, envSvc);
  }

  override async install(version: string): Promise<void> {
    const env: NodeJS.ProcessEnv = {};

    const registry = this.envSvc.replaceUrl(defaultRegistry);
    if (registry !== defaultRegistry) {
      env.RUBYGEMS_HOST = registry;
    }

    const gem = await this.getRubyGem();
    const ruby = await this.getRubyMinor();

    // TODO: create recursive
    if (!(await this.pathSvc.findToolPath(this.name))) {
      await this.pathSvc.createToolPath(this.name);
    }

    let prefix = await this.pathSvc.findVersionedToolPath(this.name, version);
    if (!prefix) {
      prefix = await this.pathSvc.createVersionedToolPath(this.name, version);
      // fix perms for later user installs
      await chmod(prefix, 0o775);
    }

    prefix = join(prefix, ruby);
    await mkdir(prefix);

    await execa(
      gem,
      [
        'install',
        this.name,
        '--install-dir',
        prefix,
        '--bindir',
        join(prefix, 'bin'),
        '--version',
        version,
      ],
      { stdio: ['inherit', 'inherit', 1], env, cwd: this.pathSvc.installDir },
    );
  }

  override async isInstalled(version: string): Promise<boolean> {
    const ruby = await this.getRubyMinor();
    return this.pathSvc.fileExists(this.getGemSpec(version, ruby));
  }

  override async link(version: string): Promise<void> {
    await this.postInstall(version);
  }

  override async postInstall(version: string): Promise<void> {
    const ruby = await this.getRubyMinor();
    const vtPath = this.pathSvc.versionedToolPath(this.name, version);
    const path = join(vtPath, ruby);
    const src = join(path, 'bin');
    const exports = `GEM_PATH=$GEM_PATH:${path}`;
    const gemSpec = await readFile(this.getGemSpec(version, ruby), {
      encoding: 'utf8',
    });
    const pkg = /\s+s\.executables\s+=\s+\[([^\]]+)\]\s+/.exec(gemSpec)?.[1];

    if (!pkg) {
      logger.warn(
        { tool: this.name, version, gemSpec },
        "Missing 'executables' in gemspec",
      );
      return;
    }

    for (const [, name] of pkg.matchAll(/"([^"]+)"/g)) {
      await this.shellwrapper({ srcDir: src, name: name!, exports });
    }
  }

  override async test(_version: string): Promise<void> {
    await execa(this.name, ['--version'], { stdio: 'inherit' });
  }

  override async validate(version: string): Promise<boolean> {
    if (!(await super.validate(version))) {
      return false;
    }

    return (await this.versionSvc.find('ruby')) !== null;
  }

  private async getRubyGem(): Promise<string> {
    const rubyVersion = await this.getRubyVersion();

    return join(this.pathSvc.versionedToolPath('ruby', rubyVersion), 'bin/gem');
  }

  private async getRubyMinor(): Promise<string> {
    const rubyVersion = await this.getRubyVersion();
    const ver = parse(rubyVersion)!;
    return `${ver.major}.${ver.minor}`;
  }

  private async getRubyVersion(): Promise<string> {
    const rubyVersion = await this.versionSvc.find('ruby');

    if (!rubyVersion) {
      throw new Error('Ruby not installed');
    }
    return rubyVersion;
  }

  private getGemSpec(version: string, ruby: string): string {
    return join(
      this.pathSvc.versionedToolPath(this.name, version),
      ruby,
      'specifications',
      `${this.name}-${version}.gemspec`,
    );
  }
}
