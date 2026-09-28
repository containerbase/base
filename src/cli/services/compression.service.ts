import { execa } from 'execa';
import { inject, injectable } from 'inversify';
import { EnvService } from './env.service.ts';

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

  /**
   * Extracts an archive with `bsdtar` into `cwd`, owned by the configured
   * user, optionally stripping leading path components or limiting to files.
   * Runs with a UTF-8 locale, so archives with non-ASCII file names extract
   * even when the caller didn't load the containerbase env.
   */
  async extract({
    file,
    cwd,
    strip,
    files,
    options,
  }: ExtractConfig): Promise<void> {
    await execa(
      'bsdtar',
      [
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
      ],
      { env: { LC_ALL: 'C.UTF-8', LANG: 'C.UTF-8' } },
    );
  }
}
