import { inject, injectable } from 'inversify';
import { EnvService, PathService } from '../services';

@injectable()
export abstract class PrepareToolBaseService {
  abstract readonly name: string;

  constructor(
    @inject(PathService) protected readonly pathSvc: PathService,
    @inject(EnvService) protected readonly envSvc: EnvService,
  ) {}

  abstract execute(): Promise<void> | void;

  toString(): string {
    return this.name;
  }
}
