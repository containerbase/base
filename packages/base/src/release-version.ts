// semver has no exports map, native ESM needs the file extension
import semverParse from 'semver/functions/parse.js';

/**
 * Checks if an image version comes from a release. Development builds write
 * the git sha or `0.0.0-PLACEHOLDER` instead.
 */
export function isReleaseVersion(imageVersion: string): boolean {
  const image = semverParse(imageVersion);
  return (
    !!image && !(image.major === 0 && image.minor === 0 && image.patch === 0)
  );
}
