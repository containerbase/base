import { injectFromHierarchy, injectable } from 'inversify';
import { V2ToolInstallService } from '../install-tool/install-legacy-tool.service';
import { v2Tool } from '../utils/v2-tool';

@injectable()
@injectFromHierarchy()
@v2Tool('terraform')
export class TerraformInstallService extends V2ToolInstallService {
  override readonly name = 'terraform';
}
