import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../../../install-tool/base-install.service';
import { ToolVersionResolver } from '../../../install-tool/tool-version-resolver';

@injectable()
@injectFromHierarchy()
export class ComposerVersionResolver extends ToolVersionResolver {
  readonly tool = 'composer';

  resolve(version: string | undefined): Promise<string | undefined> {
    return Promise.resolve(version);
  }
}

@injectable()
@injectFromHierarchy()
export class ComposerInstallService extends BaseInstallService {
  readonly name = 'composer';

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

  override uninstall(_version: string): Promise<void> {
    return Promise.resolve();
  }
}
