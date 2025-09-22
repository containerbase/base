import { injectFromHierarchy, injectable } from 'inversify';
import { V2ToolInstallService } from '../install-tool/install-legacy-tool.service';
import { v2Tool } from '../utils/v2-tool';

@injectable()
@injectFromHierarchy()
@v2Tool('nix')
export class NixInstallService extends V2ToolInstallService {
  override readonly name = 'nix';

  override needsPrepare(): boolean {
    return false;
  }
  override needsInitialize(): boolean {
    return false;
  }
}
