import fs from 'fs/promises';
import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BasePrepareService } from '../prepare-tool/base-prepare.service';
import { pathExists } from '../utils';
import {
  PrebuildInstallService,
  PrebuildVersionResolver,
} from './utils/prebuild';

@injectable()
@injectFromHierarchy()
export class MonoPrepareService extends BasePrepareService {
  readonly name = 'mono';

  override async prepare(): Promise<void> {
    // TODO: install mono dependencies if needed
    await this.initialize();
    const mono = join(this.envSvc.userHome, '.mono');
    if (!(await pathExists(mono))) {
      await fs.symlink(join(this.pathSvc.cachePath, '.mono'), mono);
    }
  }

  override async initialize(): Promise<void> {
    const mono = join(this.pathSvc.cachePath, '.mono');
    if (!(await pathExists(mono))) {
      await this.pathSvc.createDir(mono);
    }
  }
}

@injectable()
@injectFromHierarchy()
export class MonoInstallService extends PrebuildInstallService {
  readonly name = 'mono';
}

@injectable()
@injectFromHierarchy()
export class MonoVersionResolver extends PrebuildVersionResolver {
  readonly tool = 'mono';
}
