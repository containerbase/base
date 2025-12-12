import { inject, injectable } from 'inversify';
import { EnvService, PathService } from '../services';
import { NoInitTools, NoPrepareTools } from '../tools';
import { type SpawnOptions, type SpawnResult, spawn } from '../utils';

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

  needsInitialize(): boolean {
    return !NoInitTools.includes(this.name);
  }

  needsPrepare(): boolean {
    return !NoPrepareTools.includes(this.name);
  }

  toString(): string {
    return this.name;
  }

  protected _spawn(
    command: string,
    args: string[],
    options?: SpawnOptions,
  ): Promise<SpawnResult> {
    return spawn(command, args, { cwd: this.envSvc.tmpDir, ...options });
  }
}
