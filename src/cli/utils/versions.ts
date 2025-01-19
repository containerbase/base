import type SemVer from 'semver/classes/semver';
import semverCoerce from 'semver/functions/coerce';
import semverGte from 'semver/functions/gte';
import semverSatisfies from 'semver/functions/satisfies';
import semverSort from 'semver/functions/sort';

export { semverGte, semverSort, semverCoerce, semverSatisfies };

export function isValid(version: string): boolean {
  return semverCoerce(version, { loose: true }) !== null;
}

export function parse(version: string | undefined): SemVer {
  const res = semverCoerce(version, { loose: true });
  if (!res) {
    throw new Error(`Invalid version: ${version}`);
  }
  return res;
}
