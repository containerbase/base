import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../../install-tool/base-install.service.ts';
import { spyable } from '~test/mock.ts';

@injectable()
@injectFromHierarchy()
@spyable()
export class BunInstallService extends BaseInstallService {
  readonly name = 'bun';

  /** Does nothing, for tests. */
  override install(_version: string): Promise<void> {
    return Promise.resolve();
  }

  /** Does nothing, for tests. */
  override link(_version: string): Promise<void> {
    return Promise.resolve();
  }

  /** Does nothing, for tests. */
  override uninstall(_version: string): Promise<void> {
    return Promise.resolve();
  }
}
