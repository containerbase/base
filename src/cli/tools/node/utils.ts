import fs from 'node:fs/promises';
import { join } from 'node:path';
import { env as penv } from 'node:process';
import { execa } from 'execa';
import { inject, injectable } from 'inversify';
import { InstallToolBaseService } from '../../install-tool/install-tool-base.service';
import { EnvService, PathService, VersionService } from '../../services';
import { parse } from '../../utils';

const defaultRegistry = 'https://registry.npmjs.org/';

@injectable()
export abstract class InstallNpmBaseService extends InstallToolBaseService {
  protected get tool(): string {
    return this.name;
  }

  constructor(
    @inject(EnvService) envSvc: EnvService,
    @inject(PathService) pathSvc: PathService,
    @inject(VersionService) protected versionSvc: VersionService,
  ) {
    super(pathSvc, envSvc);
  }

  override async install(version: string): Promise<void> {
    const npm = await this.getNodeNpm();
    const tmp = await fs.mkdtemp(
      join(this.pathSvc.tmpDir, 'containerbase-npm-'),
    );
    const env: NodeJS.ProcessEnv = {
      NO_UPDATE_NOTIFIER: '1',
      npm_config_update_notifier: 'false',
      npm_config_fund: 'false',
    };

    if (!penv.npm_config_cache && !penv.NPM_CONFIG_CACHE) {
      env.npm_config_cache = tmp;
    }

    if (!penv.npm_config_registry && !penv.NPM_CONFIG_REGISTRY) {
      const registry = this.envSvc.replaceUrl(defaultRegistry);
      if (registry !== defaultRegistry) {
        env.npm_config_registry = registry;
      }
    }

    // TODO: create recursive
    if (!(await this.pathSvc.findToolPath(this.name))) {
      await this.pathSvc.createToolPath(this.name);
    }

    const prefix = await this.pathSvc.createVersionedToolPath(
      this.name,
      version,
    );

    await execa(
      npm,
      [
        'install',
        `${this.tool}@${version}`,
        '--save-exact',
        '--no-audit',
        '--prefix',
        prefix,
        '--cache',
        tmp,
        '--silent',
      ],
      { stdio: ['inherit', 'inherit', 1], env },
    );

    await fs.symlink(`${prefix}/node_modules/.bin`, `${prefix}/bin`);

    const ver = parse(version)!;

    if (this.name === 'npm' && ver.major < 7) {
      // update to latest node-gyp to fully support python3
      await execa(
        join(prefix, 'bin/npm'),
        [
          'explore',
          'npm',
          '--prefix',
          prefix,
          '--silent',
          '--',
          'npm',
          'install',
          'node-gyp@latest',
          '--no-audit',
          '--cache',
          tmp,
          '--silent',
        ],
        { stdio: ['inherit', 'inherit', 1], env },
      );
    }

    await fs.rm(tmp, { recursive: true, force: true });
    await fs.rm(join(this.envSvc.home, '.npm/_logs'), {
      recursive: true,
      force: true,
    });
  }

  override async link(version: string): Promise<void> {
    await this.postInstall(version);
  }

  override async postInstall(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');

    await this.shellwrapper({ srcDir: src, name: this.tool });
  }

  override async test(_version: string): Promise<void> {
    await execa(this.tool, ['--version'], { stdio: 'inherit' });
  }

  override async validate(version: string): Promise<boolean> {
    if (!(await super.validate(version))) {
      return false;
    }

    return (await this.versionSvc.find('node')) !== null;
  }

  protected async getNodeNpm(): Promise<string> {
    const nodeVersion = await this.versionSvc.find('node');

    if (!nodeVersion) {
      throw new Error('Node not installed');
    }

    return join(this.pathSvc.versionedToolPath('node', nodeVersion), 'bin/npm');
  }
}
