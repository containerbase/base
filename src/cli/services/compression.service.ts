import { inject, injectable } from 'inversify';
import { spawn } from '../utils';
import { EnvService } from './env.service';

export interface ExtractConfig {
  file: string;
  cwd: string;
  strip?: number | undefined;

  files?: string[];

  /**
   * Additional options to pass to the `bsdtar` command.
   */
  options?: string[];
}

@injectable()
export class CompressionService {
  @inject(EnvService)
  private readonly envSvc!: EnvService;

  async extract({
    file,
    cwd,
    strip,
    files,
    options,
  }: ExtractConfig): Promise<void> {
    await spawn('bsdtar', [
      '-xf',
      file,
      '-C',
      cwd,
      ...(strip ? ['--strip', `${strip}`] : []),
      '--uid',
      `${this.envSvc.userId}`,
      '--gid',
      '0',
      ...(options ?? []),
      ...(files ?? []),
    ]);
  }
}
