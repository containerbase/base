import { Command, Option, runExit } from 'clipanion';
import shell from 'shelljs';

class ReleaseCommand extends Command {
  release = Option.String('-r,--release', { required: true });
  gitSha = Option.String('--sha', { required: false });
  dryRun = Option.Boolean('-d,--dry-run', { required: false });

  async execute() {
    await Promise.resolve();
    const version = this.release;
    const dry = this.dryRun;
    /** @type {shell.ShellString} */
    let r;

    shell.echo(`Publish version: ${version}`);
    process.env.TAG = version;
    process.env.CONTAINERBASE_VERSION = version;

    if (dry) {
      shell.echo('DRY-RUN: done.');
      return 0;
    }

    shell.echo('Pushing docker images');

    r = shell.exec(
      'docker buildx bake --set settings.platform=linux/amd64,linux/arm64 push'
    );
    if (r.code) {
      return 1;
    }

    r = shell.exec(
      `cosign sign --yes ${process.env.OWNER}/${process.env.FILE}:${process.env.TAG}`
    );
    if (r.code) {
      return 1;
    }

    r = shell.exec(
      `cosign sign --yes ghcr.io/${process.env.OWNER}/${process.env.FILE}:${process.env.TAG}`
    );
    if (r.code) {
      return 1;
    }

    return 0;
  }
}

void runExit(ReleaseCommand);
