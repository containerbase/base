import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { codeBlock } from 'common-tags';
import { execa } from 'execa';
import { inject, injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../../install-tool/base-install.service.ts';
import { BasePrepareService } from '../../prepare-tool/base-prepare.service.ts';
import { AptService, HttpService } from '../../services/index.ts';
import { getDistro, logger, parse, semverGte } from '../../utils/index.ts';

/**
 * Keep in sync with the minimum git version renovate needs.
 * https://github.com/renovatebot/renovate/blob/main/lib/util/git/index.ts#L180
 */
const minVersion = '2.33.0';

const keyUrl =
  'http://keyserver.ubuntu.com/pks/lookup?op=get&search=0xF911AB184317630C59970973E363C90F8F1B6217';
const keyPath = 'etc/apt/keyrings/git.asc';

@injectable()
@injectFromHierarchy()
export class GitPrepareService extends BasePrepareService {
  @inject(HttpService)
  private readonly http!: HttpService;

  override readonly name = 'git';

  /**
   * Adds the `git-core` ppa, ubuntu ships a git version which is too old.
   */
  override async prepare(): Promise<void> {
    const distro = await getDistro();
    const key = await this.http.get(keyUrl);

    await mkdir(join(this.envSvc.rootDir, 'etc/apt/keyrings'), {
      recursive: true,
      mode: 0o755,
    });

    await writeFile(join(this.envSvc.rootDir, keyPath), key, { mode: 0o644 });
    await writeFile(
      join(this.envSvc.rootDir, 'etc/apt/sources.list.d/git.sources'),
      codeBlock`
        Types: deb
        URIs: https://ppa.launchpadcontent.net/git-core/ppa/ubuntu
        Suites: ${distro.versionCode}
        Components: main
        Architectures: ${this.envSvc.arch}
        Signed-By: /${keyPath}
      `,
    );
  }
}

@injectable()
@injectFromHierarchy()
export class GitInstallService extends BaseInstallService {
  @inject(AptService)
  private readonly aptSvc!: AptService;

  override readonly name = 'git';

  override readonly needsRoot = true;

  override async install(_version: string): Promise<void> {
    // TODO: the ppa only serves the latest version, so the requested version is ignored
    await this.aptSvc.install(this.name);

    const version = await this.installedVersion();
    if (!semverGte(version, minVersion)) {
      throw new Error(
        `Git version mismatch! Expected: ${minVersion}, got: ${version}`,
      );
    }
  }

  /**
   * git is installed system wide by apt, so there is nothing to link.
   */
  override link(_version: string): Promise<void> {
    return Promise.resolve();
  }

  override async postInstall(_version: string): Promise<void> {
    // flutter workaround
    // allow all, so it works in older git versions when the ppa is not working
    await this._spawn(this.name, ['config', '--system', 'safe.directory', '*']);
  }

  override async test(_version: string): Promise<void> {
    await this._spawn(this.name, ['--version']);
  }

  override async uninstall(_version: string): Promise<void> {
    await this.aptSvc.remove(this.name);
  }

  private async installedVersion(): Promise<string> {
    // `git --version` prints eg. `git version 2.55.0`
    const res = await execa(this.name, ['--version']);
    const { version } = parse(res.stdout.split(' ').pop());
    logger.debug({ version }, 'installed git version');
    return version;
  }
}
