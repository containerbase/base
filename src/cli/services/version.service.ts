import { chmod, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { inject, injectable } from 'inversify';
import { fileRights, logger, tool2path } from '../utils';
import { PathService } from './path.service';

@injectable()
export class VersionService {
  constructor(@inject(PathService) private pathSvc: PathService) {}

  async find(tool: string): Promise<string | null> {
    const path = join(this.pathSvc.versionPath, tool2path(tool));
    try {
      return (await readFile(path, { encoding: 'utf8' })).trim() || null;
    } catch (err) {
      if (err instanceof Error && err.code === 'ENOENT') {
        logger.debug({ tool }, 'tool version not found');
        /* c8 ignore next 3 */
      } else {
        logger.error({ tool, err }, 'tool version not found');
      }
      return null;
    }
  }

  async update(tool: string, version: string): Promise<void> {
    const path = join(this.pathSvc.versionPath, tool2path(tool));
    try {
      await writeFile(path, version, { encoding: 'utf8' });
      const s = await stat(path);
      if ((s.mode & fileRights) !== 0o664) {
        await chmod(path, 0o664);
      }
    } catch (err) {
      logger.error({ tool, err }, 'tool version not found');
    }
  }
}
