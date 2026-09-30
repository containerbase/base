import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../../install-tool/base-install.service.ts';
import { BasePrepareService } from '../../prepare-tool/base-prepare.service.ts';
import { semverGte } from '../../utils/index.ts';

@injectable()
@injectFromHierarchy()
export class ElixirPrepareService extends BasePrepareService {
  override readonly name = 'elixir';

  /** Initializes the cache and links `~/.hex` and `~/.mix` to it, keeping any existing ones. */
  override async prepare(): Promise<void> {
    await this.initialize();

    await this.pathSvc.createSymlink(
      join(this.pathSvc.cachePath, '.hex'),
      join(this.envSvc.userHome, '.hex'),
    );
    await this.pathSvc.createSymlink(
      join(this.pathSvc.cachePath, '.mix'),
      join(this.envSvc.userHome, '.mix'),
    );
  }

  /** Creates the `.mix` and `.hex` folders in the containerbase cache. */
  override async initialize(): Promise<void> {
    await this.pathSvc.createDir(join(this.pathSvc.cachePath, '.mix'));
    await this.pathSvc.createDir(join(this.pathSvc.cachePath, '.hex'));
  }
}

@injectable()
@injectFromHierarchy()
export class ElixirInstallService extends BaseInstallService {
  override readonly name = 'elixir';
  override readonly parent = 'erlang';

  /**
   * Downloads the elixir archive from GitHub, verified against its
   * `.sha256sum` since v1.14.0, and extracts it into the versioned tool
   * path. Requiring `erlang` as parent covers the shell tool's `erl` check.
   */
  override async install(version: string): Promise<void> {
    // https://github.com/elixir-lang/elixir/releases
    // https://hexdocs.pm/elixir/compatibility-and-deprecations.html#between-elixir-and-erlang-otp
    let file: string;
    if (semverGte(version, '1.20.0')) {
      file = 'elixir-otp-27.zip';
    } else if (semverGte(version, '1.19.0')) {
      file = 'elixir-otp-26.zip';
    } else if (semverGte(version, '1.17.0')) {
      file = 'elixir-otp-25.zip';
    } else if (semverGte(version, '1.15.0')) {
      file = 'elixir-otp-24.zip';
    } else if (semverGte(version, '1.14.0')) {
      file = 'elixir-otp-23.zip';
    } else {
      file = 'Precompiled.zip';
    }

    const url = `https://github.com/elixir-lang/elixir/releases/download/v${version}/${file}`;

    // elixir only publishes a `.sha256sum` checksum file since v1.14.0.
    const expectedChecksum = semverGte(version, '1.14.0')
      ? await this.findChecksum(`${url}.sha256sum`, file)
      : undefined;

    const downloaded = await this.http.download({
      url,
      checksumType: 'sha256',
      expectedChecksum,
    });

    await this.pathSvc.ensureToolPath(this.name);

    const path = await this.pathSvc.createVersionedToolPath(this.name, version);
    await this.compress.extract({ file: downloaded, cwd: path });
  }

  /**
   * Links the `elixir` and `mix` binaries into the global bin folder, then
   * runs `mix local.hex` and `mix local.rebar`.
   *
   * TODO: check rights of files and folder in ~/.mix and ~/.hex
   */
  override async link(version: string): Promise<void> {
    const srcDir = join(
      this.pathSvc.versionedToolPath(this.name, version),
      'bin',
    );

    await this.shellwrapper({ srcDir });
    await this.shellwrapper({ name: 'mix', srcDir });

    await this.runMix(['local.hex', '--force']);
    await this.runMix(['local.rebar', '--force']);
  }

  /**
   * Runs a `mix` subcommand, as the configured user via `su` when running as
   * root, mirroring the shell tool's `su -c '<command>' "${USER_NAME}"`.
   */
  private async runMix(args: string[]): Promise<void> {
    if (this.envSvc.isRoot) {
      await this._spawn('su', [
        '-c',
        `mix ${args.join(' ')}`,
        this.envSvc.userName,
      ]);
    } else {
      await this._spawn('mix', args);
    }
  }

  /** Checks that `elixir --version` and `mix --version` run. */
  override async test(_version: string): Promise<void> {
    await this._spawn('elixir', ['--version']);
    await this._spawn('mix', ['--version']);
  }
}
