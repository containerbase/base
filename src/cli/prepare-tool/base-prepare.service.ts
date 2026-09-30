import { inject, injectable } from 'inversify';
import { EnvService, PathService } from '../services/index.ts';
import { NoInitTools, NoPrepareTools } from '../tools/index.ts';
import { type SpawnOptions, type SpawnResult, spawn } from '../utils/index.ts';

/**
 * The setup a tool needs before it can be installed, split in two steps:
 *
 * - prepare runs once per image, as root, eg. to install apt packages or add
 *   an apt source
 * - initialize runs once per container, as whoever first runs the tool, eg. to
 *   create the folders and config files the tool expects in the home directory
 */
@injectable()
export abstract class BasePrepareService {
  @inject(PathService)
  protected readonly pathSvc!: PathService;
  @inject(EnvService)
  protected readonly envSvc!: EnvService;

  abstract readonly name: string;

  /** Runs the one time, root only setup. */
  prepare(): Promise<void> | void {
    // noting to do;
  }

  /** Runs the per container setup. */
  initialize(): Promise<void> | void {
    // noting to do;
  }

  /** Whether the tool has an initialize step, see `NoInitTools`. */
  needsInitialize(): boolean {
    return !NoInitTools.includes(this.name);
  }

  /** Whether the tool has a prepare step, see `NoPrepareTools`. */
  needsPrepare(): boolean {
    return !NoPrepareTools.includes(this.name);
  }

  /** The tool name, for logging. */
  toString(): string {
    return this.name;
  }

  /** Runs a command, by default in the temp folder. */
  protected _spawn(
    command: string,
    args: string[],
    options?: SpawnOptions,
  ): Promise<SpawnResult> {
    return spawn(command, args, { cwd: this.envSvc.tmpDir, ...options });
  }
}
