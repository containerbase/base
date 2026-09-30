import { chmod, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { isNonEmptyStringAndNotWhitespace } from '@sindresorhus/is';
import { execa } from 'execa';
import { inject, injectable } from 'inversify';
import { BaseInstallService } from '../../install-tool/base-install.service.ts';
import { ToolVersionResolver } from '../../install-tool/tool-version-resolver.ts';
import { VersionService } from '../../services/index.ts';
import { logger } from '../../utils/index.ts';
import { RubyGemJson } from './schema.ts';

const defaultRegistry = 'https://rubygems.org/';

@injectable()
export abstract class RubyBaseInstallService extends BaseInstallService {
  @inject(VersionService)
  protected readonly versionSvc!: VersionService;

  override readonly parent = 'ruby';

  /**
   * Installs the gem with the current ruby into a folder per ruby version
   * below the versioned tool path, from the configured gem registry.
   *
   * @throws when the gem install fails
   */
  override async install(version: string): Promise<void> {
    const env: NodeJS.ProcessEnv = {};
    const args: string[] = [];

    const registry = this.envSvc.replaceUrl(
      defaultRegistry,
      isNonEmptyStringAndNotWhitespace(env.CONTAINERBASE_CDN_GEM),
    );
    if (registry !== defaultRegistry) {
      args.push('--clear-sources', '--source', registry);
    }

    const gem = await this.getRubyGem();
    const ruby = await this.getRubyVersion();

    await this.pathSvc.ensureToolPath(this.name);

    let prefix = await this.pathSvc.findVersionedToolPath(this.name, version);
    if (!prefix) {
      prefix = await this.pathSvc.createVersionedToolPath(this.name, version);
      // fix perms for later user installs
      await chmod(prefix, 0o775);
    }

    prefix = join(prefix, ruby);
    await this.pathSvc.createDir(prefix);

    const res = await execa(
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
        '--verbose',
        ...args,
      ],
      { reject: false, env, cwd: this.pathSvc.installDir, all: true },
    );

    if (res.failed) {
      logger.warn(`Gem error:\n${res.all}`);
      await rm(prefix, { recursive: true, force: true });
      throw new Error('gem install command failed');
    } else {
      logger.trace(`gem install\n${res.all}`);
    }

    await this._postInstall(gem, version, prefix, env);
  }

  /** Whether the version is installed for the current ruby version. */
  override async isInstalled(version: string): Promise<boolean> {
    const ruby = await this.getRubyVersion();
    return this.pathSvc.fileExists(this.getGemSpec(version, ruby));
  }

  /** Links the binaries, see `postInstall`. */
  override async link(version: string): Promise<void> {
    await this.postInstall(version);
  }

  /**
   * Links every executable listed in the gemspec into the global bin folder,
   * with the gem path extended.
   */
  override async postInstall(version: string): Promise<void> {
    const ruby = await this.getRubyVersion();
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

  /** Checks that the gem binary runs with `--version`. */
  override async test(_version: string): Promise<void> {
    await this._spawn(this.name, ['--version']);
  }

  /** Runs tool specific steps after the gem install, none by default. */
  protected _postInstall(
    _gem: string,
    _version: string,
    _prefix: string,
    _env: NodeJS.ProcessEnv,
  ): Promise<void> | void {
    // no-op
  }

  /** Path of the current ruby's `gem` binary. */
  private async getRubyGem(): Promise<string> {
    const rubyVersion = await this.getRubyVersion();

    return join(this.pathSvc.versionedToolPath('ruby', rubyVersion), 'bin/gem');
  }

  /**
   * The current ruby version.
   *
   * @throws when ruby isn't installed
   */
  private async getRubyVersion(): Promise<string> {
    const rubyVersion = await this.versionSvc.getCurrent('ruby');

    if (!rubyVersion) {
      throw new Error('Ruby not installed');
    }
    return rubyVersion.tool.version;
  }

  /** Path of the installed gem's gemspec. */
  private getGemSpec(version: string, ruby: string): string {
    return join(
      this.pathSvc.versionedToolPath(this.name, version),
      ruby,
      'specifications',
      `${this.name}-${version}.gemspec`,
    );
  }
}

@injectable()
export abstract class RubyGemVersionResolver extends ToolVersionResolver {
  /** Resolves a missing version or `latest` to the latest rubygems release. */
  async resolve(version: string | undefined): Promise<string | undefined> {
    if (version === undefined || version === 'latest') {
      const meta = RubyGemJson.parse(
        await this.http.getJson(
          `https://rubygems.org/api/v1/gems/${this.tool}.json`,
        ),
      );
      return meta.version;
    }
    return version;
  }
}
