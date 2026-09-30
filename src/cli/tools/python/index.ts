import fs from 'node:fs/promises';
import { join } from 'node:path';
import { env as penv } from 'node:process';
import { isNonEmptyStringAndNotWhitespace } from '@sindresorhus/is';
import { inject, injectFromHierarchy, injectable } from 'inversify';
import { BasePrepareService } from '../../prepare-tool/base-prepare.service.ts';
import { AptService } from '../../services/index.ts';
import { getDistro, parse } from '../../utils/index.ts';
import { PrebuildInstallService } from '../utils/prebuild.ts';

const defaultPipRegistry = 'https://pypi.org/simple/';

/** The ubuntu releases python can be installed on. */
const supportedDistros = ['jammy', 'noble', 'resolute'];

@injectable()
@injectFromHierarchy()
export class PythonPrepareService extends BasePrepareService {
  @inject(AptService)
  private readonly aptSvc!: AptService;

  override readonly name = 'python';

  /**
   * Installs the apt packages needed to build common python packages, links
   * `/usr/local/python` to the tool path, a workaround for python's hard-coded
   * paths, and exports the pip user bin folder and pip settings.
   *
   * @throws on an unsupported distro
   */
  override async prepare(): Promise<void> {
    const { versionCode } = await getDistro();
    if (!supportedDistros.includes(versionCode)) {
      throw new Error(
        `Tool '${this.name}' not supported on: ${versionCode}! Please use ubuntu 'jammy', 'noble' or 'resolute'.`,
      );
    }

    await this.aptSvc.install('default-libmysqlclient-dev', 'gcc', 'libpq-dev');

    await this.pathSvc.createSymlink(
      this.pathSvc.toolPath(this.name),
      join(this.envSvc.rootDir, 'usr/local/python'),
    );

    await this.pathSvc.exportPath(join(this.envSvc.userHome, '.local/bin'));
    await this.pathSvc.exportEnv({ PIP_DISABLE_PIP_VERSION_CHECK: '1' });
  }
}

@injectable()
@injectFromHierarchy()
export class PythonInstallService extends PrebuildInstallService {
  override readonly name = 'python';

  /**
   * Every python prebuild for jammy, which noble and resolute use too, has a
   * `.sha512`, so the checksum is always verified without probing for it.
   */
  protected override hasChecksum(_checksumFileUrl: string): Promise<boolean> {
    return Promise.resolve(true);
  }

  /**
   * Installs the python prebuild, points the python shebangs in its `bin`
   * folder to the installed python, and updates `pip` and `virtualenv`.
   */
  override async install(version: string): Promise<void> {
    await super.install(version);

    const bin = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');
    await this.fixShebangs(bin, version);

    await this._spawn(
      join(bin, 'python'),
      [
        '-W',
        'ignore',
        '-m',
        'pip',
        'install',
        '--compile',
        '--no-warn-script-location',
        '--no-cache-dir',
        '--quiet',
        '--upgrade',
        'pip',
        'virtualenv',
      ],
      { env: this.pipEnv() },
    );
  }

  /**
   * Links `python` and `pip`, each also with the major and the major and minor
   * version suffix, into the global bin folder.
   */
  override async link(version: string): Promise<void> {
    const srcDir = join(
      this.pathSvc.versionedToolPath(this.name, version),
      'bin',
    );
    const { major, minor } = parse(version);

    for (const name of ['python', 'pip']) {
      for (const suffix of ['', `${major}`, `${major}.${minor}`]) {
        await this.shellwrapper({ srcDir, name: `${name}${suffix}` });
      }
    }
  }

  /** Checks that `python --version` and `pip --version` run. */
  override async test(_version: string): Promise<void> {
    await this._spawn('python', ['--version']);
    await this._spawn('pip', ['--version'], {
      env: { PYTHONWARNINGS: 'ignore' },
    });
  }

  /**
   * Points the shebang of the text files in `bin` that run `python`,
   * `python<major>` or `python<major>.<minor>` to that binary in `bin`.
   */
  private async fixShebangs(bin: string, version: string): Promise<void> {
    const { major, minor } = parse(version);
    const shebang = new RegExp(
      `^#!.*/bin/(python(?:${major}(?:\\.${minor})?)?)(?=\\n|$)`,
    );

    for (const entry of await fs.readdir(bin, {
      recursive: true,
      withFileTypes: true,
    })) {
      if (!entry.isFile()) {
        continue;
      }

      const file = join(entry.parentPath, entry.name);
      const content = await fs.readFile(file);
      // skip binary files
      if (content.includes(0)) {
        continue;
      }

      const text = content.toString('utf8');
      const fixed = text.replace(
        shebang,
        (_match, python: string) => `#!${join(bin, python)}`,
      );
      if (fixed !== text) {
        await fs.writeFile(file, fixed);
      }
    }
  }

  /**
   * The env for the pip update: root user warnings off, pep517 builds and the
   * configured pip index.
   */
  private pipEnv(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {
      PIP_ROOT_USER_ACTION: 'ignore',
      PIP_USE_PEP517: 'true',
    };

    const pipIndex = this.envSvc.replaceUrl(
      defaultPipRegistry,
      isNonEmptyStringAndNotWhitespace(penv.CONTAINERBASE_CDN_PIP),
    );
    if (pipIndex !== defaultPipRegistry) {
      env.PIP_INDEX_URL = pipIndex;
    }

    return env;
  }
}
