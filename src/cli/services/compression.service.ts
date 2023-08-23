import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { execa } from 'execa';
import { injectable } from 'inversify';
import tar from 'tar';

export interface ExtractConfig {
  file: string;
  cwd: string;
  strip?: number;

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

    await pipeline(
      createReadStream(file),
      tar.x({ cwd, strip, newer: true, keep: false }, files),
    );
  }
}
