import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
// semver has no exports map, native ESM needs the file extension
import semverGte from 'semver/functions/gte.js';
import semverParse from 'semver/functions/parse.js';

/**
 * Where the containerbase image embeds the tool-versions data: the extracted
 * release archive, with the root `index.json` and one folder per format, eg.
 * `v1/<tool>.json`.
 */
export const toolVersionsPath = '/usr/local/containerbase/tool-versions';

/**
 * The file in which the containerbase image records its version.
 */
export const containerbaseVersionFile = '/usr/local/containerbase/version';

/**
 * The version of this package, which is released with the same version as
 * containerbase itself.
 */
export const packageVersion: string = (
  createRequire(import.meta.url)('../package.json') as { version: string }
).version;

/**
 * Checks if the process runs in a containerbase image, whose environment sets
 * `CONTAINERBASE`.
 *
 * @param env the environment to check, `process.env` by default
 */
export function isContainerbase(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return !!env.CONTAINERBASE;
}

/**
 * Checks if a containerbase image supports everything this package describes:
 * the image has the same major version and the same or a newer minor or patch
 * version.
 *
 * @param imageVersion the version of the image, eg. from
 * `containerbaseVersionFile`
 * @param version the version to compare with, this package's by default
 * @returns `false` for another major, an older image or a version which can't
 * be parsed
 */
export function isCompatibleVersion(
  imageVersion: string,
  version: string = packageVersion,
): boolean {
  const image = semverParse(imageVersion.trim());
  const pkg = semverParse(version);
  return !!image && !!pkg && image.major === pkg.major && semverGte(image, pkg);
}

/**
 * Checks if an image version comes from a release. Development builds write
 * the git sha or `0.0.0-PLACEHOLDER` instead.
 */
function isReleaseVersion(imageVersion: string): boolean {
  const image = semverParse(imageVersion);
  return (
    !!image && !(image.major === 0 && image.minor === 0 && image.patch === 0)
  );
}

/**
 * Reads the version of the containerbase image and throws when it isn't
 * compatible with this package, see `isCompatibleVersion`. Call it only when
 * `isContainerbase()` is true.
 *
 * Development images, whose version is a git sha or `0.0.0-…`, aren't checked.
 * A missing or empty version file still throws.
 *
 * @param file the version file to read, `containerbaseVersionFile` by default
 * @returns the version of the image
 */
export async function validateContainerbaseVersion(
  file: string = containerbaseVersionFile,
): Promise<string> {
  let content: string;
  try {
    content = await readFile(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        `The containerbase image version file ${file} is missing`,
        { cause: err },
      );
    }
    throw err;
  }
  const imageVersion = content.trim();
  if (!imageVersion) {
    throw new Error(`The containerbase image version file ${file} is empty`);
  }
  if (isReleaseVersion(imageVersion) && !isCompatibleVersion(imageVersion)) {
    throw new Error(
      `The containerbase image version ${imageVersion} is not compatible with @containerbase/base ${packageVersion}, it needs the same major version and the same or a newer minor or patch version`,
    );
  }
  return imageVersion;
}
