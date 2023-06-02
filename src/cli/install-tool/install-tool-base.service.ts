import { injectable } from 'inversify';
import type { PathService } from '../services';

@injectable()
export abstract class InstallToolBaseService {
  abstract readonly name: string;

  constructor(protected readonly pathSvc: PathService) {}

  abstract install(version: string): Promise<void>;

  async isInstalled(version: string): Promise<boolean> {
    return !!(await this.pathSvc.findVersionedToolPath(this.name, version));
  }

  abstract link(version: string): Promise<void>;

  test(_version: string): Promise<void> {
    return Promise.resolve();
  }

  toString(): string {
    return this.name;
  }

  validate(_version: string): boolean {
    return true;
  }
}
