import fs from 'node:fs/promises';
import path from 'node:path';
import { valid as validPep440 } from '@renovatebot/pep440';
import { execa } from 'execa';
import { parse as parseIni } from 'ini';
import { inject, injectable } from 'inversify';
import { BaseInstallService } from '../../install-tool/base-install.service';
import { EnvService, PathService, VersionService } from '../../services';
import { logger, parse, semverGte } from '../../utils';

@injectable()
export abstract class PythonBaseInstallService extends BaseInstallService {
  constructor(
    @inject(EnvService) envSvc: EnvService,
    @inject(PathService) pathSvc: PathService,
    @inject(VersionService) protected versionSvc: VersionService,
  ) {
    super(pathSvc, envSvc);
  }

  protected prepareEnv(_version: string): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {};

    // const registry = this.envSvc.replaceUrl(
    //   defaultRegistry,
    //   isNonEmptyStringAndNotWhitespace(env.CONTAINERBASE_CDN_NPM),
    // );
    // if (registry !== defaultRegistry) {
    //   env.npm_config_registry = registry;
    // }

    return env;
  }
}

@injectable()
export abstract class PipBaseInstallService extends PythonBaseInstallService {
  protected tool(_version: string): string {
    return this.name;
  }

  override async install(version: string): Promise<void> {
    const pythonVersion = await this.getPythonVersion();
    const env = this.prepareEnv(version);

    await this.pathSvc.ensureToolPath(this.name);

    let prefix = await this.pathSvc.findVersionedToolPath(this.name, version);
    if (!prefix) {
      prefix = await this.pathSvc.createVersionedToolPath(this.name, version);
      // fix perms for later user installs
      await fs.chmod(prefix, 0o775);
    }

    prefix = path.join(prefix, pythonVersion);
    await fs.mkdir(prefix);
    await this.createVirtualenv(prefix, env);
    await this.installPackage(version, pythonVersion, env, prefix);
  }

  private async installPackage(
    version: string,
    pythonVersion: string,
    env: NodeJS.ProcessEnv,
    prefix: string,
  ): Promise<void> {
    const res = await execa(
      this.getPython(version, pythonVersion),
      [
        '-W',
        'ignore',
        '-m',
        'pip',
        'install',
        '--compile',
        '--use-pep517',
        '--no-warn-script-location',
        '--no-cache-dir',
        `${this.tool(version)}==${version}`,
        ...this.getAdditionalArgs(version, pythonVersion),
      ],
      { reject: false, env, cwd: this.pathSvc.installDir, all: true },
    );

    if (res.failed) {
      logger.warn(`Pip error:\n${res.all}`);
      await fs.rm(prefix, { recursive: true, force: true });
      throw new Error('pip install command failed');
    } else {
      logger.trace(`pip install:\n${res.all}`);
    }
  }

  private async createVirtualenv(
    prefix: string,
    env: NodeJS.ProcessEnv,
  ): Promise<void> {
    const res = await execa(
      'python',
      ['-m', 'virtualenv', '--no-periodic-update', prefix],
      { reject: false, env, cwd: this.pathSvc.installDir, all: true },
    );

    if (res.failed) {
      logger.warn(`Python virtualenv error:\n${res.all}`);
      await fs.rm(prefix, { recursive: true, force: true });
      throw new Error('python virtualenv command failed');
    } else {
      logger.trace(`python virtualenv:\n${res.all}`);
    }
  }

  override async isInstalled(version: string): Promise<boolean> {
    const pythonVersion = await this.getPythonVersion();
    return await this.pathSvc.fileExists(
      this.packageDistPath(version, pythonVersion),
    );
  }

  override async link(version: string): Promise<void> {
    await this.postInstall(version);
  }

  override async postInstall(version: string): Promise<void> {
    const pythonVersion = await this.getPythonVersion();
    const src = path.join(
      this.pathSvc.versionedToolPath(this.name, version),
      pythonVersion,
      'bin',
    );
    const entryPoints = this.packageDistPath(
      version,
      pythonVersion,
      'entry_points.txt',
    );

    logger.trace({ entryPoints }, 'entry_points');

    if (await this.pathSvc.fileExists(entryPoints)) {
      const pkg = parseIni(await fs.readFile(entryPoints, 'utf-8'));
      logger.trace({ pkg }, 'entry_points');

      if (pkg.console_scripts) {
        for (const name of Object.keys(pkg.console_scripts)) {
          await this.shellwrapper({
            srcDir: src,
            name,
            extraToolEnvs: ['python'],
          });
        }
        return;
      }
    }

    // fallback to the tool name
    await this.shellwrapper({
      srcDir: src,
      name: this.name,
      extraToolEnvs: ['python'],
    });
  }

  override async test(_version: string): Promise<void> {
    let name = this.name;
    switch (name) {
      case 'pip-tools':
        name = 'pip-compile';
        break;
    }
    await execa(name, ['--version'], { stdio: 'inherit' });
  }

  override async validate(version: string): Promise<boolean> {
    if (!validPep440(version)) {
      return false;
    }

    return (await this.versionSvc.find('python')) !== null;
  }

  private getPython(version: string, pythonVersion: string): string {
    return path.join(
      this.pathSvc.versionedToolPath(this.tool(version), version),
      pythonVersion,
      'bin',
      'python',
    );
  }

  protected async getPythonVersion(): Promise<string> {
    const version = await this.versionSvc.find('python');

    if (!version) {
      throw new Error('Python not installed');
    }
    return version;
  }

  protected getAdditionalArgs(
    version: string,
    pythonVersion: string,
  ): string[] {
    switch (this.name) {
      case 'copier':
        // Some templates require the ability to use custom Jinja extensions.
        return ['copier-templates-extensions'];
      case 'hashin':
        return ['setuptools'];
      case 'pip-tools': {
        // keyrings.envvars added support for looking up credentials by service name only, which is needed by the Renovate pip-compile manager
        // keyrings.envvars package does not support python versions lower than 3.9
        const pVer = parse(pythonVersion);
        if (pVer.major > 3 || (pVer.major === 3 && pVer.minor >= 9)) {
          return ['keyrings.envvars>=1.1.0'];
        }
        break;
      }
      case 'poetry': {
        if (semverGte(version, '1.2.1')) {
          return ['poetry-plugin-pypi-mirror'];
        }
      }
    }
    return [];
  }

  private packageDistPath(
    version: string,
    pythonVersion: string,
    file = 'WHEEL',
  ): string {
    const pVer = parse(pythonVersion);
    return path.join(
      this.pathSvc.versionedToolPath(this.name, version),
      pythonVersion,
      'lib',
      `python${pVer.major}.${pVer.minor}`,
      'site-packages',
      `${this.tool(version).replaceAll(/[-_.]+/g, '_')}-${version}.dist-info`,
      file,
    );
  }
}
