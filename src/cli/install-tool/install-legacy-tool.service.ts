import { isNonEmptyStringAndNotWhitespace } from '@sindresorhus/is';
import { execa } from 'execa';
import { inject, injectable } from 'inversify';
import { V2ToolService } from '../services/index.ts';
import { logger } from '../utils/index.ts';
import { BaseInstallService } from './base-install.service.ts';

const defaultPipRegistry = 'https://pypi.org/simple/';

@injectable()
export class V1ToolInstallService {
  /** Installs a v1 shell tool through `v1-install-tool.sh`. */
  async execute(tool: string, version: string): Promise<void> {
    logger.debug(`Installing legacy tool ${tool} v${version} ...`);

    await execa(
      'bash',
      ['/usr/local/containerbase/bin/v1-install-tool.sh', tool, version],
      {
        stdio: ['inherit', 'inherit', 1],
      },
    );
  }
}

@injectable()
export abstract class V2ToolInstallService extends BaseInstallService {
  @inject(V2ToolService)
  private readonly _svc!: V2ToolService;

  /** Runs the `install` step of the v2 shell tool. */
  override async install(version: string): Promise<void> {
    logger.debug(`Installing v2 tool ${this.name} v${version} ...`);
    const env: NodeJS.ProcessEnv = {};

    // TODO: drop when python is converted
    const pipIndex = this.envSvc.replaceUrl(
      defaultPipRegistry,
      isNonEmptyStringAndNotWhitespace(env.CONTAINERBASE_CDN_PIP),
    );
    if (pipIndex !== defaultPipRegistry) {
      env.PIP_INDEX_URL = pipIndex;
    }

    await execa(
      'bash',
      [
        '/usr/local/containerbase/bin/v2-install-tool.sh',
        'install',
        this.name,
        version,
      ],
      {
        stdio: ['inherit', 'inherit', 1],
        env,
      },
    );
  }

  /** Runs the `link` step of the v2 shell tool. */
  override async link(version: string): Promise<void> {
    logger.debug(`Linking v2 tool ${this.name} v${version} ...`);
    await execa(
      'bash',
      [
        '/usr/local/containerbase/bin/v2-install-tool.sh',
        'link',
        this.name,
        version,
      ],
      {
        stdio: ['inherit', 'inherit', 1],
      },
    );
  }

  /** Whether the v2 shell tool defines an `init_tool` function. */
  override needsInitialize(): boolean {
    return this._svc.needsInitialize(this.name);
  }

  /** Whether the v2 shell tool defines a `prepare_tool` function. */
  override needsPrepare(): boolean {
    return this._svc.needsPrepare(this.name);
  }

  /** Runs the `test` step of the v2 shell tool. */
  override async test(version: string): Promise<void> {
    logger.debug(`Testing v2 tool ${this.name} v${version} ...`);
    await execa(
      'bash',
      [
        '/usr/local/containerbase/bin/v2-install-tool.sh',
        'test',
        this.name,
        version,
      ],
      {
        stdio: ['inherit', 'inherit', 1],
      },
    );
  }

  /** Runs the `post-install` step, when the v2 shell tool defines one. */
  override async postInstall(version: string): Promise<void> {
    if (this._svc.hasPostinstall(this.name)) {
      logger.debug(`Postinstall v2 tool ${this.name} ...`);
      await execa(
        'bash',
        [
          '/usr/local/containerbase/bin/v2-install-tool.sh',
          'post-install',
          this.name,
          version,
        ],
        {
          stdio: ['inherit', 'inherit', 1],
        },
      );
    }
  }

  /**
   * Runs the `uninstall` step, when the v2 shell tool defines one, and removes
   * the versioned tool path.
   */
  override async uninstall(version: string): Promise<void> {
    logger.debug(`Uninstall v2 tool ${this.name} v${version} ...`);

    if (this._svc.hasUninstall(this.name)) {
      await execa(
        'bash',
        [
          '/usr/local/containerbase/bin/v2-install-tool.sh',
          'uninstall',
          this.name,
          version,
        ],
        {
          stdio: ['inherit', 'inherit', 1],
        },
      );
    }
    await super.uninstall(version);
  }

  /** Runs the `check` step of the v2 shell tool, returning false on failure. */
  override async validate(version: string): Promise<boolean> {
    logger.debug(`Validating v2 tool ${this.name} v${version} ...`);
    try {
      await execa(
        'bash',
        [
          '/usr/local/containerbase/bin/v2-install-tool.sh',
          'check',
          this.name,
          version,
        ],
        {
          stdio: ['inherit', 'inherit', 1],
        },
      );
      return true;
    } catch (err) {
      logger.debug({ err }, 'validation error');
      return false;
    }
  }
}
