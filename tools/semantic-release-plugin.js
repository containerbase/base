import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { execa } from 'execa';
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
 * Runs a command without throwing, its output goes straight to the log.
 * @param {string} file
 * @param {string[]} args
 */
function run(file, args) {
  return execa(file, args, { reject: false, stdio: 'inherit' });
}

/**
 * Runs a command and throws when it fails.
 * @param {string} file
 * @param {string[]} args
 */
async function exec(file, args) {
  const result = await run(file, args);
  if (result.failed) {
    throw releaseError(result.shortMessage);
  }
}

/** Platforms of the release images. */
const platforms = '--set=settings.platform=linux/amd64,linux/arm64';

/** Signing attempts per image, transient sigstore or registry errors pass on a retry. */
const signAttempts = 3;

/** Delay between signing attempts in milliseconds. */
const signDelay = 10_000;

/**
 * Signs an image, retrying failed attempts. When all attempts fail it reports
 * a GitHub Actions error annotation instead of failing the release.
 * @param {SuccessContext['logger']} logger
 * @param {string} image
 */
async function sign(logger, image) {
  for (let attempt = 1; ; attempt++) {
    const result = await run('cosign', ['sign', '--yes', image]);
    if (!result.failed) {
      return;
    }
    if (attempt >= signAttempts) {
      logger.error(result.shortMessage);
      process.stdout.write(
        // an annotation ends at the first newline
        `::error title=Image signing failed::${result.shortMessage.split('\n')[0]}\n`,
      );
      return;
    }
    logger.log(`Signing ${image} failed, retrying in ${signDelay / 1000}s`);
    await setTimeout(signDelay);
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

  await fs.mkdir('bin', { recursive: true });

  await exec('pnpm', ['build']);

  await fs.writeFile(
    'dist/docker/usr/local/containerbase/version',
    nextRelease.version,
  );
  await exec('tar', [
    '-cJf',
    './bin/containerbase.tar.xz',
    '-C',
    './dist/docker',
    '.',
  ]);

  await hashFile('./bin/containerbase.tar.xz', 'sha512');
  await hashFile('./dist/cli/containerbase-cli-amd64', 'sha512');
  await hashFile('./dist/cli/containerbase-cli-arm64', 'sha512');

  await exec('docker', ['buildx', 'bake', platforms, 'build']);
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
  await exec('docker', [
    'buildx',
    'bake',
    platforms,
    '--metadata-file',
    metadataFile,
    'push',
  ]);

  const meta = JSON.parse(await fs.readFile(metadataFile, 'utf8'));
  digest = meta?.push?.['containerimage.digest'];

  if (!digest) {
    logger.error(`Bake metadata:\n${JSON.stringify(meta, null, 2)}`);
    throw releaseError('Missing image digest in the bake metadata');
  }

  // the workflow attests the images with this digest
  if (process.env.GITHUB_OUTPUT) {
    await fs.appendFile(process.env.GITHUB_OUTPUT, `digest=${digest}\n`);
  }
}

/**
 * Signs the pushed images. A failed signing doesn't fail the release, it is
 * reported as a GitHub Actions error annotation instead.
 * @param {unknown} _config
 * @param {SuccessContext} context
 */
export async function success(_config, { logger }) {
  if (!digest) {
    return;
  }

  for (const image of [
    `${process.env.OWNER}/${process.env.FILE}`,
    `ghcr.io/${process.env.OWNER}/${process.env.FILE}`,
  ]) {
    await sign(logger, `${image}@${digest}`);
  }
}
