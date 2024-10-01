import { inject, injectable } from 'inversify';
import { EnvService, PathService } from '../services';

@injectable()
export abstract class BasePrepareService {
  abstract readonly name: string;

  constructor(
    @inject(PathService) protected readonly pathSvc: PathService,
    @inject(EnvService) protected readonly envSvc: EnvService,
  ) {}

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
