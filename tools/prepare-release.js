import fs from 'fs/promises';
import { Command, Option, runExit } from 'clipanion';
import shell from 'shelljs';

class PrepareCommand extends Command {
  release = Option.String('-r,--release', { required: true });
  gitSha = Option.String('--sha', { required: false });
  dryRun = Option.Boolean('-d,--dry-run', { required: false });

  async execute() {
    const version = this.release;

    shell.echo(`Preparing version: ${version}`);

    if (this.dryRun) {
      shell.echo('DRY-RUN: done.');
      return;
    }

    process.env.TAG = version;
    process.env.CONTAINERBASE_VERSION = version;

    shell.mkdir('-p', 'bin');

    await fs.writeFile('src/usr/local/buildpack/version', version);

    let r = shell.exec('tar -cJf ./bin/containerbase.tar.xz -C ./src .');
    if (r.code) {
      return 1;
    }

    r = shell.exec('sha512sum ./bin/containerbase.tar.xz');
    if (r.code) {
      return 1;
    }
    r.to('./bin/containerbase.tar.xz.sha512');

    r = shell.cp('./bin/containerbase.tar.xz', './bin/buildpack.tar.xz');
    if (r.code) {
      shell.exit(1);
    }

    r = shell.exec(
      'docker buildx bake --set settings.platform=linux/amd64,linux/arm64 build'
    );
    if (r.code) {
      return 1;
    }
  }
}

void runExit(PrepareCommand);
