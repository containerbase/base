import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../../install-tool/base-install.service';
import { spyable } from '~test/mock';

@injectable()
@injectFromHierarchy()
@spyable()
export class BunInstallService extends BaseInstallService {
  readonly name = 'bun';

  override install(_version: string): Promise<void> {
    return Promise.resolve();
  }

  override link(_version: string): Promise<void> {
    return Promise.resolve();
  }
}
