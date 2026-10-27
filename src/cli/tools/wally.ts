import { injectFromHierarchy, injectable } from 'inversify';
import { PrebuildInstallService } from './utils/prebuild.ts';

/**
 * Installs the containerbase wally prebuild, newer ubuntu releases use the
 * jammy one, see `PrebuildInstallService`.
 */
@injectable()
@injectFromHierarchy()
export class WallyInstallService extends PrebuildInstallService {
  readonly name = 'wally';
  override readonly minVersion = '0.3.0';
}
