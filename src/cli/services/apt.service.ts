import { rm, writeFile } from 'fs/promises';
import { join } from 'node:path';
import { execa } from 'execa';
import { inject, injectable } from 'inversify';
import { logger } from '../utils';
import { EnvService } from './env.service';

@injectable()
export class AptService {
  constructor(@inject(EnvService) private readonly envSvc: EnvService) {}

  async install(...packages: string[]): Promise<void> {
    const todo: string[] = [];

    for (const pkg of packages) {
      if (await this.isInstalled(pkg)) {
        continue;
      }
      todo.push(pkg);
    }

    if (todo.length === 0) {
      logger.debug({ packages }, 'all packages already installed');
      return;
    }

    logger.debug({ packages: todo }, 'installing packages');

    if (this.envSvc.aptProxy) {
      logger.debug({ proxy: this.envSvc.aptProxy }, 'using apt proxy');
      await writeFile(
        join(
          this.envSvc.rootDir,
          'etc/apt/apt.conf.d/containerbase-proxy.conf',
        ),
        `Acquire::http::Proxy "${this.envSvc.aptProxy}";\n`,
      );
    }

    try {
      await execa('apt-get', ['-qq', 'update']);
      await execa('apt-get', ['-qq', 'install', '-y', ...todo]);
    } finally {
      if (this.envSvc.aptProxy) {
        await rm(
          join(
            this.envSvc.rootDir,
            'etc/apt/apt.conf.d/containerbase-proxy.conf',
          ),
          {
            force: true,
          },
        );
      }
    }
  }

  private async isInstalled(pkg: string): Promise<boolean> {
    try {
      const res = await execa('dpkg', ['-s', pkg]);
      return res.stdout.includes('Status: install ok installed');
    } catch {
      return false;
    }
  }
}
