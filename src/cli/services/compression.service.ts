import { execa } from 'execa';
import { injectable } from 'inversify';

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
  async extract({
    file,
    cwd,
    strip,
    files,
    options,
  }: ExtractConfig): Promise<void> {
    await execa('bsdtar', [
      '-xf',
      file,
      '-C',
      cwd,
      ...(strip ? ['--strip', `${strip}`] : []),
      ...(options ?? []),
      ...(files ?? []),
    ]);
  }
}
