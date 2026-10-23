import semverParse from 'semver/functions/parse.js';

/**
 * Checks if an image version comes from a release. Development builds write
 * `0.0.0-PLACEHOLDER`, CI builds add the git sha as build metadata.
 */
export function isReleaseVersion(imageVersion: string): boolean {
  const image = semverParse(imageVersion);
  return (
    !!image && !(image.major === 0 && image.minor === 0 && image.patch === 0)
  );
}
