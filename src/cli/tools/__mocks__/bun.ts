import { inject, injectable } from 'inversify';
import { BaseInstallService } from '../../install-tool/base-install.service';
import { EnvService, PathService } from '../../services';

@injectable()
export class BunInstallService extends BaseInstallService {
  readonly name = 'bun';

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
