import { isNonEmptyStringAndNotWhitespace } from '@sindresorhus/is';
import { inject, injectable } from 'inversify';
import spawn from 'nano-spawn';
import { V2ToolService } from '../services';
import { logger } from '../utils';
import { BaseInstallService } from './base-install.service';

const defaultPipRegistry = 'https://pypi.org/simple/';

@injectable()
export class V1ToolInstallService {
  async execute(tool: string, version: string): Promise<void> {
    logger.debug(`Installing legacy tool ${tool} v${version} ...`);

    await spawn(
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

    await spawn(
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

  override async link(version: string): Promise<void> {
    logger.debug(`Linking v2 tool ${this.name} v${version} ...`);
    await spawn(
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

  override needsInitialize(): boolean {
    return this._svc.needsInitialize(this.name);
  }

  override needsPrepare(): boolean {
    return this._svc.needsPrepare(this.name);
  }

  override async test(version: string): Promise<void> {
    logger.debug(`Testing v2 tool ${this.name} v${version} ...`);
    await spawn(
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

  override async postInstall(version: string): Promise<void> {
    if (this._svc.hasPostinstall(this.name)) {
      logger.debug(`Postinstall v2 tool ${this.name} ...`);
      await spawn(
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

  override async uninstall(version: string): Promise<void> {
    logger.debug(`Uninstall v2 tool ${this.name} v${version} ...`);

    if (this._svc.hasUninstall(this.name)) {
      await spawn(
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

  override async validate(version: string): Promise<boolean> {
    logger.debug(`Validating v2 tool ${this.name} v${version} ...`);
    try {
      await spawn(
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
