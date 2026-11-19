import type SemVer from 'semver/classes/semver';
import semverCoerce from 'semver/functions/coerce';
import semverGte from 'semver/functions/gte';
import semverLt from 'semver/functions/lt';
import semverParse from 'semver/functions/parse';
import semverSatisfies from 'semver/functions/satisfies';
import semverSort from 'semver/functions/sort';
import semverValid from 'semver/functions/valid';
import semverMaxSatisfying from 'semver/ranges/max-satisfying';

export {
  semverGte,
  semverMaxSatisfying,
  semverSort,
  semverCoerce,
  semverSatisfies,
};

/** Whether the version is valid semver. */
export function isValid(version: string): boolean {
  return semverValid(version) !== null;
}

/**
 * Compares two versions segment by segment, a missing segment counts as `0`,
 * so `4.9` equals `4.9.0`. Segments are compared numerically, a non-numeric
 * one is compared as text, with the digits in it compared as numbers.
 * @returns a negative number if `a` is older, a positive one if it is newer,
 * else `0`
 */
export function compareSegments(a: string, b: string): number {
  const left = a.split('.');
  const right = b.split('.');
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) {
    const diff = (left[i] ?? '0').localeCompare(right[i] ?? '0', 'en', {
      numeric: true,
    });
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

/**
 * Whether the version is older than the minimum: compared as semver when both
 * are, so a prerelease of the minimum is older, else segment by segment, see
 * {@link compareSegments}, eg. for `1.0` or four-part versions.
 */
export function isBelowVersion(version: string, min: string): boolean {
  if (isValid(version) && isValid(min)) {
    return semverLt(version, min);
  }
  return compareSegments(version, min) < 0;
}

/** Whether the version has four numeric parts, eg. `3.10.1.0`. */
export function isFourPartVersion(version: string): boolean {
  return /^\d+\.\d+\.\d+\.\d+$/.test(version);
}

/**
 * Parses the version as semver.
 *
 * @throws on an invalid version
 */
export function parse(version: string | undefined): SemVer {
  const res = semverParse(version);
  if (!res) {
    throw new Error(`Invalid version: ${version}`);
  }
  return res;
}
