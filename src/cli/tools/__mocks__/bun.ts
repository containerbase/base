import { injectable } from 'inversify';
import { BaseInstallService } from '../../install-tool/base-install.service';

@injectable()
export class BunInstallService extends BaseInstallService {
  readonly name = 'bun';

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
