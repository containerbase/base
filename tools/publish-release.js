import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Command, Option, runExit } from 'clipanion';
import shell from 'shelljs';

class ReleaseCommand extends Command {
  release = Option.String('-r,--release', { required: true });
  channel = Option.String('-c,--channel', { required: true });
  gitSha = Option.String('--sha');
  dryRun = Option.Boolean('-d,--dry-run');

  async execute() {
    await Promise.resolve();
    const { channel, dryRun, gitSha, release } = this;
    /** @type {shell.ShellString} */
    let r;

    shell.echo(`Publish version: ${release} (${gitSha}, ${channel})`);
    process.env.TAG = release;
    process.env.CONTAINERBASE_VERSION = release;

    if (channel) {
      process.env.CHANNEL = channel.replace('maint/', '');
    }

    const tmp = await fs.mkdtemp(
      path.join(os.tmpdir(), 'renovate-docker-bake-'),
    );
    const metadataFile = path.join(tmp, 'metadata.json');

    if (dryRun) {
      shell.echo('DRY-RUN: done.');
      return 0;
    }

    shell.echo('Pushing docker images');

    r = shell.exec(
      `docker buildx bake --set settings.platform=linux/amd64,linux/arm64 --metadata-file ${metadataFile} push`,
    );
    if (r.code) {
      return 1;
    }

    const meta = JSON.parse(await fs.readFile(metadataFile, 'utf8'));
    const digest = meta?.push?.['containerimage.digest'];

    if (!digest) {
      shell.echo('Error: missing digest\n' + JSON.stringify(meta, null, 2));
      return 1;
    }

    r = shell.exec(
      `cosign sign --yes ${process.env.OWNER}/${process.env.FILE}@${digest}`,
    );
    if (r.code) {
      return 1;
    }

    r = shell.exec(
      `cosign sign --yes ghcr.io/${process.env.OWNER}/${process.env.FILE}@${digest}`,
    );
    if (r.code) {
      return 1;
    }

    return 0;
  }
}

void runExit(ReleaseCommand);
