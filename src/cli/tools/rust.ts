import { injectFromHierarchy, injectable } from 'inversify';
import { V2ToolInstallService } from '../install-tool/install-legacy-tool.service';
import { V2ToolPrepareService } from '../prepare-tool/prepare-legacy-tools.service';
import { v2Tool } from '../utils/v2-tool';

@injectable()
@injectFromHierarchy()
@v2Tool('rust')
export class RustPrepareService extends V2ToolPrepareService {
  override readonly name = 'rust';
}

@injectable()
@injectFromHierarchy()
@v2Tool('rust')
export class RustInstallService extends V2ToolInstallService {
  override readonly name = 'rust';
}
