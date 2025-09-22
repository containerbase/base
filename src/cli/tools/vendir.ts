import { injectFromHierarchy, injectable } from 'inversify';
import { V2ToolInstallService } from '../install-tool/install-legacy-tool.service';
import { v2Tool } from '../utils/v2-tool';

@injectable()
@injectFromHierarchy()
@v2Tool('vendir')
export class VendirInstallService extends V2ToolInstallService {
  override readonly name = 'vendir';

  override needsPrepare(): boolean {
    return false;
  }
  override needsInitialize(): boolean {
    return false;
  }
}
