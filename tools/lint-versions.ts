import { readFile } from 'node:fs/promises';

// checks that the tool versions pinned in `mise.toml` match the ones used by CI

/** Reads a file from the repository root. */
async function read(file: string): Promise<string> {
  return await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
}

const mise = await read('mise.toml');
const nodeVersion = (await read('.node-version')).trim();
const { packageManager } = JSON.parse(await read('package.json')) as {
  packageManager: string;
};

let failed = false;

/** Reports a mismatch and makes the script exit non zero. */
function fail(message: string): void {
  console.error(message);
  failed = true;
}

/** Compares the version `mise.toml` pins for a tool with the given one. */
function compare(tool: string, version: string, source: string): void {
  const match = new RegExp(`^${tool} = "(?<version>[^"]+)"`, 'm').exec(mise);
  const pinned = match?.groups?.version ?? 'nothing';
  if (pinned !== version) {
    fail(`mise.toml pins ${tool} to ${pinned}, but ${source} says ${version}`);
  }
}

compare('node', nodeVersion, '.node-version');

// we don't use corepack, so `packageManager` must not carry a hash
const pnpmVersion = /^pnpm@(?<version>[^+]+)$/.exec(packageManager)?.groups
  ?.version;

if (pnpmVersion) {
  compare('pnpm', pnpmVersion, 'the `packageManager` field of `package.json`');
} else {
  fail(
    `package.json sets packageManager to ${packageManager}, but a plain pnpm@<version> without a corepack hash is required`,
  );
}

if (failed) {
  process.exitCode = 1;
}
