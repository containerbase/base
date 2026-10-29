import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import shell from 'shelljs';
import { hashFile } from './utils.js';

/** @typedef {import('semantic-release').PrepareContext} PrepareContext */
/** @typedef {import('semantic-release').PublishContext} PublishContext */
/** @typedef {import('semantic-release').SuccessContext} SuccessContext */

/** Digest of the pushed images, set by `publish` and signed in `success`. */
let digest = '';

/**
 * Creates an error without stack trace, semantic-release logs plain errors
 * with their whole stack and the command output is already in the log.
 * @param {string} message
 */
function releaseError(message) {
  const err = new Error(message);
  err.stack = `${err.name}: ${err.message}`;
  return err;
}

/**
 * Runs a shell command, its output goes straight to the log, and throws when
 * it fails.
 * @param {string} cmd
 */
function exec(cmd) {
  const r = shell.exec(cmd);
  if (r.code) {
    throw releaseError(`Command failed with exit code ${r.code}: ${cmd}`);
  }
}

/**
 * Sets the env the build and the docker bake file read for the release.
 * @param {PrepareContext} context
 */
function setReleaseEnv({ branch, nextRelease }) {
  process.env.TAG = nextRelease.version;
  process.env.CONTAINERBASE_VERSION = nextRelease.version;

  if (branch.channel) {
    process.env.CHANNEL = branch.channel.replace('maint/', '');
  }
}

/**
 * Builds the cli, the release archives with their checksums and the images.
 * @param {unknown} _config
 * @param {PrepareContext} context
 */
export async function prepare(_config, context) {
  const { branch, logger, nextRelease } = context;
  logger.log(
    `Preparing version: ${nextRelease.version} (${nextRelease.gitHead}, ${branch.channel ?? ''})`,
  );
  setReleaseEnv(context);

  shell.mkdir('-p', 'bin');

  exec('pnpm build');

  await fs.writeFile(
    'dist/docker/usr/local/containerbase/version',
    nextRelease.version,
  );
  exec('tar -cJf ./bin/containerbase.tar.xz -C ./dist/docker .');

  await hashFile('./bin/containerbase.tar.xz', 'sha512');
  await hashFile('./dist/cli/containerbase-cli-amd64', 'sha512');
  await hashFile('./dist/cli/containerbase-cli-arm64', 'sha512');

  exec(
    'docker buildx bake --set settings.platform=linux/amd64,linux/arm64 build',
  );
}

/**
 * Pushes the images, they are signed in `success` after all plugins published.
 * @param {unknown} _config
 * @param {PublishContext} context
 */
export async function publish(_config, context) {
  const { branch, logger, nextRelease } = context;
  logger.log(
    `Publish version: ${nextRelease.version} (${nextRelease.gitHead}, ${branch.channel ?? ''})`,
  );
  setReleaseEnv(context);

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'renovate-docker-bake-'));
  const metadataFile = path.join(tmp, 'metadata.json');

  logger.log('Pushing docker images');
  exec(
    `docker buildx bake --set settings.platform=linux/amd64,linux/arm64 --metadata-file ${metadataFile} push`,
  );

  const meta = JSON.parse(await fs.readFile(metadataFile, 'utf8'));
  digest = meta?.push?.['containerimage.digest'];

  if (!digest) {
    logger.error(`Bake metadata:\n${JSON.stringify(meta, null, 2)}`);
    throw releaseError('Missing image digest in the bake metadata');
  }
}

/**
 * Signs the pushed images. A failed signing doesn't fail the release, it is
 * reported as a GitHub Actions error annotation instead.
 * @param {unknown} _config
 * @param {SuccessContext} context
 */
export function success(_config, { logger }) {
  if (!digest) {
    return;
  }

  for (const image of [
    `${process.env.OWNER}/${process.env.FILE}`,
    `ghcr.io/${process.env.OWNER}/${process.env.FILE}`,
  ]) {
    const r = shell.exec(`cosign sign --yes ${image}@${digest}`);
    if (r.code) {
      logger.error(`Signing ${image}@${digest} failed`);
      process.stdout.write(
        `::error title=Image signing failed::Signing ${image}@${digest} failed with exit code ${r.code}\n`,
      );
    }
  }
}
