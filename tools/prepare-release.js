import fs from 'fs/promises';
import { Command, Option, runExit } from 'clipanion';
import shell from 'shelljs';
import { hashFile } from './utils.js';

shell.config.fatal = true;

class PrepareCommand extends Command {
  release = Option.String('-r,--release', { required: true });
  gitSha = Option.String('--sha');
  dryRun = Option.Boolean('-d,--dry-run');

  async execute() {
    const version = this.release;

    shell.echo(`Preparing version: ${version}`);

    if (this.dryRun) {
      shell.echo('DRY-RUN: done.');
      return 0;
    }

    process.env.TAG = version;
    process.env.CONTAINERBASE_VERSION = version;

    shell.mkdir('-p', 'bin');

    shell.exec('pnpm build');

    await fs.writeFile('dist/docker/usr/local/containerbase/version', version);
    shell.exec(`tar -cJf ./bin/containerbase.tar.xz -C ./dist/docker .`);

    await hashFile('./bin/containerbase.tar.xz', 'sha512');
    await hashFile('./dist/cli/containerbase-cli-amd64', 'sha512');
    await hashFile('./dist/cli/containerbase-cli-arm64', 'sha512');

    shell.exec(
      'docker buildx bake --set settings.platform=linux/amd64,linux/arm64 build',
    );

    return 0;
  }
}

void runExit(PrepareCommand);
