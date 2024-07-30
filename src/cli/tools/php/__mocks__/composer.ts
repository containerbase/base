import { inject, injectable } from 'inversify';
import { InstallToolBaseService } from '../../../install-tool/install-tool-base.service';
import { ToolVersionResolver } from '../../../install-tool/tool-version-resolver';
import { EnvService, PathService } from '../../../services';

@injectable()
export class ComposerVersionResolver extends ToolVersionResolver {
  readonly tool = 'composer';

  resolve(version: string | undefined): Promise<string | undefined> {
    return Promise.resolve(version);
  }
}

@injectable()
export class ComposerInstallService extends InstallToolBaseService {
  readonly name = 'composer';

  constructor(
    @inject(PathService) pathSvc: PathService,
    @inject(EnvService) envSvc: EnvService,
  ) {
    super(pathSvc, envSvc);
  }

  override isInstalled(_version: string): Promise<boolean> {
    return Promise.resolve(false);
  }

  override install(_version: string): Promise<void> {
    return Promise.resolve();
  }

  override link(_version: string): Promise<void> {
    return Promise.resolve();
  }

  override test(_version: string): Promise<void> {
    return Promise.resolve();
  }
}
