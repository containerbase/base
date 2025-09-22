import { injectFromHierarchy, injectable } from 'inversify';
import { V2ToolInstallService } from '../install-tool/install-legacy-tool.service';
import { v2Tool } from '../utils/v2-tool';

@injectable()
@injectFromHierarchy()
@v2Tool('jb')
export class JsonnetBundlerInstallService extends V2ToolInstallService {
  override readonly name = 'jb';

  override needsPrepare(): boolean {
    return false;
  }
  override needsInitialize(): boolean {
    return false;
  }
}
