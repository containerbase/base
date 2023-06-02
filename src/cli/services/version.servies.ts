import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { inject, injectable } from 'inversify';
import { logger } from '../utils';
import { PathService } from './path.service';

@injectable()
export class VersionService {
  constructor(@inject(PathService) private pathSvc: PathService) {}

  async find(tool: string): Promise<string | null> {
    const path = join(this.pathSvc.versionPath, tool);
    try {
      if (!(await stat(path).then((s) => s.isFile()))) {
        return null;
      }
      return (await readFile(path, { encoding: 'utf8' })) ?? null;
    } catch (err) {
      logger.debug({ tool, err }, 'tool version not found');
      return null;
    }
  }

  async update(tool: string, version: string): Promise<void> {
    const path = join(this.pathSvc.versionPath, tool);
    try {
      await writeFile(path, version, { encoding: 'utf8', mode: 0o664 });
    } catch (err) {
      logger.error({ tool, err }, 'tool version not found');
    }
  }
}
