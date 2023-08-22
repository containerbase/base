import fs, { appendFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { env as penv } from 'node:process';
import is from '@sindresorhus/is';
import { execa } from 'execa';
import { inject, injectable } from 'inversify';
import type { PackageJson } from 'type-fest';
import { InstallToolBaseService } from '../../install-tool/install-tool-base.service';
import { EnvService, PathService, VersionService } from '../../services';
import { fileExists, logger, parse } from '../../utils';

const defaultRegistry = 'https://registry.npmjs.org/';

@injectable()
export abstract class InstallNodeBaseService extends InstallToolBaseService {
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
    const env = this.prepareEnv(tmp);

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
      await this.updateNodeGyp(prefix, tmp, env);
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
    const vtPath = this.pathSvc.versionedToolPath(this.name, version);
    const src = join(vtPath, 'bin');
    const pkg = await readPackageJson(join(vtPath, 'node_modules', this.tool));

    if (!pkg.bin) {
      logger.warn(
        { tool: this.name, version },
        "Missing 'bin' in package.json",
      );
      return;
    }

    if (is.string(pkg.bin)) {
      await this.shellwrapper({ srcDir: src, name: pkg.name ?? this.tool });
      return;
    }

    for (const name of Object.keys(pkg.bin)) {
      await this.shellwrapper({ srcDir: src, name });
    }
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

  private async getNodeNpm(): Promise<string> {
    const nodeVersion = await this.versionSvc.find('node');

    if (!nodeVersion) {
      throw new Error('Node not installed');
    }

    return join(this.pathSvc.versionedToolPath('node', nodeVersion), 'bin/npm');
  }

  protected prepareEnv(tmp: string): NodeJS.ProcessEnv {
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

    return env;
  }

  protected async updateNodeGyp(
    prefix: string,
    tmp: string,
    env: NodeJS.ProcessEnv,
    global = false,
  ): Promise<void> {
    await execa(
      join(prefix, 'bin/npm'),
      [
        'explore',
        'npm',
        ...(global ? ['-g'] : []),
        '--prefix',
        prefix,
        // '--silent',
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
}

async function preparePrefix(prefix: string): Promise<Promise<void>> {
  // npm 7 bug
  await mkdir(`${prefix}/bin`, { recursive: true });
  await mkdir(`${prefix}/lib`, { recursive: true });
}

/**
 * Helper function to link to a globally installed node
 */
export async function prepareGlobalConfig({
  prefix,
  versionedToolPath,
}: {
  prefix: string;
  versionedToolPath: string;
}): Promise<Promise<void>> {
  await preparePrefix(prefix);
  await mkdir(`${versionedToolPath}/etc`, { recursive: true });
  await appendFile(`${versionedToolPath}/etc/npmrc`, `prefix = "${prefix}"`);
}
/**
 * Helper function to link to a user installed node
 */
export async function prepareUserConfig({
  prefix,
  home,
  name,
}: {
  prefix: string;
  home: string;
  name: string;
}): Promise<void> {
  const npmrc = `${home}/.npmrc`;
  if (
    (await fileExists(npmrc)) &&
    (await readFile(npmrc, { encoding: 'utf8' })).includes('prefix')
  ) {
    return;
  }

  await preparePrefix(prefix);
  await appendFile(npmrc, `prefix = "${prefix}"`);
  await mkdir(`${home}/.npm/_logs`, { recursive: true });
  // fs isn't recursive, so we use system binaries
  await execa('chown', ['-R', name, prefix, npmrc, `${home}/.npm`]);
  await execa('chmod', ['-R', 'g+w', prefix, npmrc, `${home}/.npm`]);
}

async function readPackageJson(path: string): Promise<PackageJson> {
  const data = await readFile(join(path, 'package.json'), { encoding: 'utf8' });
  return JSON.parse(data);
}
