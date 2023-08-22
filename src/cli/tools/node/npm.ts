import { execa } from 'execa';
import { injectable } from 'inversify';
import { InstallNodeBaseService } from './utils';

@injectable()
export class InstallBowerService extends InstallNodeBaseService {
  override readonly name: string = 'bower';
}

@injectable()
export class InstallCorepackService extends InstallNodeBaseService {
  override name: string = 'corepack';
}

@injectable()
export class InstallLernaService extends InstallNodeBaseService {
  override readonly name: string = 'lerna';
}

@injectable()
export class InstallNpmService extends InstallNodeBaseService {
  override readonly name: string = 'npm';
}

@injectable()
export class InstallPnpmService extends InstallNodeBaseService {
  override readonly name: string = 'pnpm';
}

@injectable()
export class InstallRenovateService extends InstallNodeBaseService {
  override readonly name: string = 'renovate';
}

@injectable()
export class InstallYarnService extends InstallNodeBaseService {
  override readonly name: string = 'yarn';
}

@injectable()
export class InstallYarnSlimService extends InstallNodeBaseService {
  override readonly name: string = 'yarn-slim';

  protected override get tool(): string {
    return 'yarn';
  }

  override async install(version: string): Promise<void> {
    await super.install(version);
    // TODO: replace with javascript
    const prefix = await this.pathSvc.findVersionedToolPath(this.name, version);
    await execa(
      'sed',
      [
        '-i',
        's/ steps,/ steps.slice(0,1),/',
        `${prefix}/node_modules/yarn/lib/cli.js`,
      ],
      { stdio: ['inherit', 'inherit', 1] },
    );
  }
}
