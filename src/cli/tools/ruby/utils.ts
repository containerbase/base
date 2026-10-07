import { chmod, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { env as penv } from 'node:process';
import { isNonEmptyStringAndNotWhitespace } from '@sindresorhus/is';
import { execa } from 'execa';
import { inject, injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../../install-tool/base-install.service.ts';
import {
  ToolVersionResolver,
  isPartialVersion,
  newestVersion,
  partialVersionHelp,
} from '../../install-tool/tool-version-resolver.ts';
import { VersionService } from '../../services/index.ts';
import { logger } from '../../utils/index.ts';
import { RubyGemJson, RubyGemVersionsJson } from './schema.ts';

const defaultRegistry = 'https://rubygems.org/';
const gemVersionPattern = /^\d+(?:\.[0-9a-z]+)*$/i;

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
    const args = this.registryArgs();

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

  /**
   * The `gem install` args for the configured gem registry: the CDN when
   * `CONTAINERBASE_CDN_GEM` is set, and the URL replacements.
   * @returns the source args, or none for the default registry
   */
  protected registryArgs(): string[] {
    const registry = this.envSvc.replaceUrl(
      defaultRegistry,
      isNonEmptyStringAndNotWhitespace(penv.CONTAINERBASE_CDN_GEM),
    );
    return registry === defaultRegistry
      ? []
      : ['--clear-sources', '--source', registry];
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

  /**
   * Accepts RubyGems version strings: a numeric first segment followed by
   * dot-separated segments of digits and letters, eg. `2`, `5.2`, `6.1.7.10`
   * or `7.0.0.rc2`.
   */
  override validate(version: string): Promise<boolean> {
    return Promise.resolve(gemVersionPattern.test(version));
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
  override readonly versionHelp = partialVersionHelp;

  /**
   * Resolves a version from rubygems.org, a configured gem registry is not
   * used for the lookup. Like other lookups, the request goes through the
   * configured CDN and URL replacements.
   *
   * - A missing version or `latest` resolves to the latest release.
   * - A major (`1`) or major.minor (`1.16`) version which is no existing
   *   release resolves to the newest matching release, prereleases are
   *   skipped. An existing release, like `1.2`, is kept.
   * - Any other version, like a full `X.Y.Z`, is returned unchanged.
   *
   * @throws if a partial version can't be looked up on rubygems.org, since
   * gem can't install it as given, or if it matches no release.
   */
  async resolve(version: string | undefined): Promise<string | undefined> {
    if (version === undefined || version === 'latest') {
      const meta = RubyGemJson.parse(
        await this.http.getJson(
          `https://rubygems.org/api/v1/gems/${this.tool}.json`,
        ),
      );
      return meta.version;
    }
    if (isPartialVersion(version)) {
      let releases: RubyGemVersionsJson;
      try {
        releases = RubyGemVersionsJson.parse(
          await this.http.getJson(
            `https://rubygems.org/api/v1/versions/${this.tool}.json`,
          ),
        );
      } catch (err) {
        // gem would install `= X.Y` and the install then misses its gemspec,
        // so fail early like before partial versions were accepted
        throw new Error(
          `Could not resolve ${this.tool} version ${version} on rubygems.org, use a full version`,
          { cause: err },
        );
      }
      if (releases.some((r) => r.number === version)) {
        return version;
      }
      const release = newestVersion(
        releases
          .filter((r) => !r.prerelease && r.number.startsWith(`${version}.`))
          .map((r) => r.number),
      );
      if (!release) {
        throw new Error(`No ${this.tool} release found for version ${version}`);
      }
      return release;
    }
    return version;
  }
}

/**
 * Creates a version resolver for a tool which is a plain gem.
 * @param tool - the tool and gem name
 */
export function createGemVersionResolver(
  tool: string,
): new () => RubyGemVersionResolver {
  @injectable()
  @injectFromHierarchy()
  class GenericVersionResolver extends RubyGemVersionResolver {
    override readonly tool: string = tool;
  }
  return GenericVersionResolver;
}
