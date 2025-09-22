import { injectFromHierarchy, injectable } from 'inversify';
import { V2ToolInstallService } from '../install-tool/install-legacy-tool.service';
import { V2ToolPrepareService } from '../prepare-tool/prepare-legacy-tools.service';
import { v2Tool } from '../utils/v2-tool';

@injectable()
@injectFromHierarchy()
@v2Tool('powershell')
export class PowershellPrepareService extends V2ToolPrepareService {
  override readonly name = 'powershell';

  override needsPrepare(): boolean {
    return true;
  }
  override needsInitialize(): boolean {
    return false;
  }
}

@injectable()
@injectFromHierarchy()
@v2Tool('powershell')
export class PowershellInstallService extends V2ToolInstallService {
  override readonly name = 'powershell';

  override needsPrepare(): boolean {
    return true;
  }
  override needsInitialize(): boolean {
    return false;
  }
}
