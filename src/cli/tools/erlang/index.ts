import { injectFromHierarchy, injectable } from 'inversify';
import { V2ToolInstallService } from '../../install-tool/install-legacy-tool.service';
import { V2ToolPrepareService } from '../../prepare-tool/prepare-legacy-tools.service';
import { v2Tool } from '../../utils/v2-tool';

@injectable()
@injectFromHierarchy()
@v2Tool('elixir')
export class ErlangPrepareService extends V2ToolPrepareService {
  override readonly name = 'erlang';

  override needsPrepare(): boolean {
    return true;
  }
  override needsInitialize(): boolean {
    return false;
  }
}

@injectable()
@injectFromHierarchy()
@v2Tool('erlang')
export class ErlangInstallService extends V2ToolInstallService {
  override readonly name = 'erlang';

  override needsPrepare(): boolean {
    return true;
  }
  override needsInitialize(): boolean {
    return false;
  }
}
