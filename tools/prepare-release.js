import fs from 'fs/promises';
import { Command, Option, runExit } from 'clipanion';
import shell from 'shelljs';

class PrepareCommand extends Command {
  release = Option.String('-r, --release', { required: true });

  async execute() {
    const version = this.release;
    shell.echo(`Preparing version: ${version}`);
    process.env.TAG = version;
    process.env.CONTAINERBASE_VERSION = version;

    shell.mkdir('-p', 'bin', 'src/opt/containerbase');

    await fs.writeFile('src/opt/containerbase/version', version);

    let r = shell.exec(
      `tar --exclude='./cli' -cJf ./bin/containerbase.tar.xz -C ./src .`
    );
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
      return 1;
    }

    // compile the cli
    r = shell.exec('yarn build:cli');
    if (r.code) {
      return 1;
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
