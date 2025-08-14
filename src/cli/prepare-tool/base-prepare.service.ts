import { inject, injectable } from 'inversify';
import { EnvService, PathService } from '../services';

@injectable()
export abstract class BasePrepareService {
  @inject(PathService)
  protected readonly pathSvc!: PathService;
  @inject(EnvService)
  protected readonly envSvc!: EnvService;

  abstract readonly name: string;

  prepare(): Promise<void> | void {
    // noting to do;
  }
  initialize(): Promise<void> | void {
    // noting to do;
  }

  toString(): string {
    return this.name;
  }
}
