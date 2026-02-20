import fs, { appendFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { env as penv } from 'node:process';
import { isNonEmptyStringAndNotWhitespace, isString } from '@sindresorhus/is';
import { execa } from 'execa';
import { inject, injectable } from 'inversify';
import type { PackageJson } from 'type-fest';
import { BaseInstallService } from '../../install-tool/base-install.service';
import {
  type EnvService,
  type PathService,
  VersionService,
} from '../../services';
import { logger, parse, pathExists, spawn } from '../../utils';

const defaultRegistry = 'https://registry.npmjs.org/';

@injectable()
export abstract class NodeBaseInstallService extends BaseInstallService {
  @inject(VersionService)
  protected readonly versionSvc!: VersionService;

  protected prepareEnv(_version: string, tmp: string): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {
      NO_UPDATE_NOTIFIER: '1',
      npm_config_update_notifier: 'false',
      npm_config_fund: 'false',
      NODE_OPTIONS: getNodeOptions(penv.NODE_OPTIONS),
    };

    if (!penv.npm_config_cache && !penv.NPM_CONFIG_CACHE) {
      env.npm_config_cache = tmp;
    }

    const registry = this.envSvc.replaceUrl(
      defaultRegistry,
      isNonEmptyStringAndNotWhitespace(penv.CONTAINERBASE_CDN_NPM),
    );
    if (registry !== defaultRegistry) {
      env.npm_config_registry = registry;
    }

    return env;
  }

  protected async updateNodeGyp(
    prefix: string,
    tmp: string,
    env: NodeJS.ProcessEnv,
    global = false,
  ): Promise<void> {
    const nodeModulesRoot = global ? `${prefix}/lib` : prefix;
    const cwd = `${nodeModulesRoot}/node_modules/npm/node_modules/npm-lifecycle`;
    const res = await execa(
      join(prefix, 'bin/npm'),
      ['install', 'node-gyp@latest', '--no-audit', '--cache', tmp],
      { reject: false, env, cwd, all: true },
    );

    if (res.failed) {
      logger.warn(`Npm error:\n${res.all}`);
      throw new Error('node-gyp update command failed');
    }
  }
}

@injectable()
export abstract class NpmBaseInstallService extends NodeBaseInstallService {
  override readonly parent = 'node';

  protected tool(_version: string): string {
    return this.name;
  }

  override async install(version: string): Promise<void> {
    const nodeVersion = await this.getNodeVersion();
    const npm = this.getNodeNpm(nodeVersion);
    const tmp = await fs.mkdtemp(
      join(this.envSvc.tmpDir, 'containerbase-npm-'),
    );
    const env = this.prepareEnv(version, tmp);

    await this.pathSvc.ensureToolPath(this.name);

    let prefix = await this.pathSvc.findVersionedToolPath(this.name, version);
    if (!prefix) {
      prefix = await this.pathSvc.createVersionedToolPath(this.name, version);
      // fix perms for later user installs
      await this.pathSvc.setOwner({ path: prefix });
    }

    prefix = join(prefix, nodeVersion);
    await this.pathSvc.createDir(prefix);

    const res = await execa(
      npm,
      [
        'install',
        `${this.tool(version)}@${version}`,
        '--save-exact',
        '--no-audit',
        '--prefix',
        prefix,
        '--cache',
        tmp,
        ...this.getAdditionalArgs(),
        '-d',
      ],
      { reject: false, env, cwd: this.pathSvc.installDir, all: true },
    );

    if (res.failed) {
      logger.warn(`Npm error:\n${res.all}`);
      await fs.rm(prefix, { recursive: true, force: true });
      throw new Error('npm install command failed');
    } else {
      logger.trace(`npm install:\n${res.all}`);
    }

    await fs.symlink(`${prefix}/node_modules/.bin`, `${prefix}/bin`);
    if (this.name === 'npm') {
      const pkg = await readPackageJson(
        this.packageJsonPath(version, nodeVersion),
      );
      const ver = parse(pkg.version);
      if (ver.major < 7) {
        // update to latest node-gyp to fully support python3
        await this.updateNodeGyp(prefix, tmp, env);
      }
    }

    await fs.rm(tmp, { recursive: true, force: true });
    await fs.rm(join(this.envSvc.home, '.npm/_logs'), {
      recursive: true,
      force: true,
    });
  }

  override async isInstalled(version: string): Promise<boolean> {
    const node = await this.getNodeVersion();
    return await this.pathSvc.fileExists(this.packageJsonPath(version, node));
  }

  override async link(version: string): Promise<void> {
    await this.postInstall(version);
  }

  override async postInstall(version: string): Promise<void> {
    const node = await this.getNodeVersion();
    const src = join(
      this.pathSvc.versionedToolPath(this.name, version),
      node,
      'bin',
    );
    const pkg = await readPackageJson(this.packageJsonPath(version, node));

    if (!pkg.bin) {
      logger.warn(
        { tool: this.name, version },
        "Missing 'bin' in package.json",
      );
      return;
    }

    if (isString(pkg.bin)) {
      await this.shellwrapper({
        srcDir: src,
        name: pkg.name ?? this.tool(version),
      });
      return;
    }

    for (const name of Object.keys(pkg.bin)) {
      await this.shellwrapper({ srcDir: src, name, extraToolEnvs: ['node'] });
    }
  }

  override async test(version: string): Promise<void> {
    let name = this.tool(version);
    const idx = name.lastIndexOf('/');
    if (idx > 0) {
      name = name.slice(idx + 1);
    }
    await this._spawn(name, ['--version']);
  }

  private getNodeNpm(nodeVersion: string): string {
    return join(this.pathSvc.versionedToolPath('node', nodeVersion), 'bin/npm');
  }

  protected async getNodeVersion(): Promise<string> {
    const nodeVersion = await this.versionSvc.getCurrent('node');

    if (!nodeVersion) {
      throw new Error('Node not installed');
    }
    return nodeVersion.tool.version;
  }

  protected getAdditionalArgs(): string[] {
    return [];
  }

  private packageJsonPath(version: string, node: string): string {
    return join(
      this.pathSvc.versionedToolPath(this.name, version),
      node,
      'node_modules',
      this.tool(version),
      'package.json',
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
    (await pathExists(npmrc)) &&
    (await readFile(npmrc, { encoding: 'utf8' })).includes('prefix')
  ) {
    return;
  }

  await preparePrefix(prefix);
  await appendFile(npmrc, `prefix = "${prefix}"`);
  await mkdir(`${home}/.npm/_logs`, { recursive: true });
  // fs isn't recursive, so we use system binaries
  await spawn('chown', ['-R', name, prefix, npmrc, `${home}/.npm`]);
  await spawn('chmod', ['-R', 'g+w', prefix, npmrc, `${home}/.npm`]);
}

async function readPackageJson(path: string): Promise<PackageJson> {
  const data = await readFile(path, { encoding: 'utf8' });
  return JSON.parse(data);
}

export async function prepareNpmCache(pathSvc: PathService): Promise<void> {
  const path = join(pathSvc.cachePath, '.npm');
  await pathSvc.createDir(path);
}

export async function prepareNpmrc(pathSvc: PathService): Promise<void> {
  const path = join(pathSvc.cachePath, '.npmrc');
  if (!(await pathExists(path))) {
    await pathSvc.writeFile(path, '');
  }
}

export async function prepareSymlinks(
  envSvc: EnvService,
  pathSvc: PathService,
): Promise<void> {
  await fs.symlink(
    join(pathSvc.cachePath, '.npm'),
    join(envSvc.userHome, '.npm'),
  );
  await fs.symlink(
    join(pathSvc.cachePath, '.npmrc'),
    join(envSvc.userHome, '.npmrc'),
  );
}

/**
 * Merge the parent process' NODE_OPTIONS value with options needed by Containerbase.
 */
export function getNodeOptions(currentOptions: string | undefined): string {
  if (!currentOptions) {
    return '--use-openssl-ca';
  }

  // Check if --use-openssl-ca is already present as a complete option
  // Split by whitespace and check for exact match
  const options = currentOptions.split(/\s+/);
  if (options.includes('--use-openssl-ca')) {
    return currentOptions;
  }

  // Append --use-openssl-ca to existing options
  return `${currentOptions} --use-openssl-ca`;
}
