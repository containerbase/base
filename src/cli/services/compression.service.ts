import { execa } from 'execa';
import { injectable } from 'inversify';
import { extract } from 'tar/extract';

export interface ExtractConfig {
  file: string;
  cwd: string;
  strip?: number | undefined;

  files?: string[];
}

@injectable()
export class CompressionService {
  async extract({ file, cwd, strip, files }: ExtractConfig): Promise<void> {
    if (
      file.endsWith('.zip') ||
      file.endsWith('.tar.xz') ||
      file.endsWith('.txz')
    ) {
      await execa('bsdtar', [
        '-xf',
        file,
        '-C',
        cwd,
        ...(strip ? ['--strip', `${strip}`] : []),
        ...(files ?? []),
      ]);
      return;
    }

    await extract(
      { cwd, ...(strip ? { strip } : {}), newer: true, keep: false, file },
      files,
    );
  }
}
