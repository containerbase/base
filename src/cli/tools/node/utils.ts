import fs, { appendFile, chmod, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { env as penv } from 'node:process';
import { isNonEmptyStringAndNotWhitespace, isString } from '@sindresorhus/is';
import { execa } from 'execa';
import { inject, injectable } from 'inversify';
import type { PackageJson } from 'type-fest';
import { InstallToolBaseService } from '../../install-tool/install-tool-base.service';
import { EnvService, PathService, VersionService } from '../../services';
import { fileExists, logger, parse } from '../../utils';

const defaultRegistry = 'https://registry.npmjs.org/';

@injectable()
export abstract class InstallNodeBaseService extends InstallToolBaseService {
  constructor(
    @inject(EnvService) envSvc: EnvService,
    @inject(PathService) pathSvc: PathService,
    @inject(VersionService) protected versionSvc: VersionService,
  ) {
    super(pathSvc, envSvc);
  }

  protected prepareEnv(_version: string, tmp: string): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {
      NO_UPDATE_NOTIFIER: '1',
      npm_config_update_notifier: 'false',
      npm_config_fund: 'false',
    };

    if (!penv.npm_config_cache && !penv.NPM_CONFIG_CACHE) {
      env.npm_config_cache = tmp;
    }

    const registry = this.envSvc.replaceUrl(
      defaultRegistry,
      isNonEmptyStringAndNotWhitespace(env.CONTAINERBASE_CDN_NPM),
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
    const res = await execa(
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
      { reject: false, env, cwd: this.pathSvc.installDir, all: true },
    );

    if (res.failed) {
      logger.warn(`Npm error:\n${res.all}`);
      throw new Error('node-gyp update command failed');
    }
  }
}

@injectable()
export abstract class InstallNpmBaseService extends InstallNodeBaseService {
  protected tool(_version: string): string {
    return this.name;
  }

  override async install(version: string): Promise<void> {
    const node = await this.getNodeVersion();
    const npm = this.getNodeNpm(node);
    const tmp = await fs.mkdtemp(
      join(this.pathSvc.tmpDir, 'containerbase-npm-'),
    );
    const env = this.prepareEnv(version, tmp);

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

    prefix = join(prefix, node);
    await mkdir(prefix);

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
      const pkg = await readPackageJson(this.packageJsonPath(version, node));
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
      await this.shellwrapper({ srcDir: src, name });
    }
  }

  override async test(version: string): Promise<void> {
    await execa(this.tool(version), ['--version'], { stdio: 'inherit' });
  }

  override async validate(version: string): Promise<boolean> {
    if (!(await super.validate(version))) {
      return false;
    }

    return (await this.versionSvc.find('node')) !== null;
  }

  private getNodeNpm(nodeVersion: string): string {
    return join(this.pathSvc.versionedToolPath('node', nodeVersion), 'bin/npm');
  }

  protected async getNodeVersion(): Promise<string> {
    const nodeVersion = await this.versionSvc.find('node');

    if (!nodeVersion) {
      throw new Error('Node not installed');
    }
    return nodeVersion;
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
  const data = await readFile(path, { encoding: 'utf8' });
  return JSON.parse(data);
}
