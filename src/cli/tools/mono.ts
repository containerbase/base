import { injectFromHierarchy, injectable } from 'inversify';
import {
  PrebuildInstallService,
  PrebuildVersionResolver,
} from './utils/prebuild';

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
