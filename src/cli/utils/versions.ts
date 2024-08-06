import type SemVer from 'semver/classes/semver';
import semverCoerce from 'semver/functions/coerce';
import semverGte from 'semver/functions/gte';
import semverParse from 'semver/functions/parse';
import semverSatisfies from 'semver/functions/satisfies';
import semverSort from 'semver/functions/sort';
import semverValid from 'semver/functions/valid';

export { semverGte, semverSort, semverCoerce, semverSatisfies };

export function isValid(version: string): boolean {
  return semverValid(version) !== null;
}

export function parse(version: string | undefined): SemVer {
  const res = semverParse(version);
  if (!res) {
    throw new Error(`Invalid version: ${version}`);
  }
  return res;
}
