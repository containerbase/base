import semverGt from 'semver/functions/gt.js';
import semverGte from 'semver/functions/gte.js';
import semverValid from 'semver/functions/valid.js';
import { isReleaseVersion } from './release-version.ts';
import type { ToolVersion, ToolVersions } from './tool-versions-types.ts';

/**
 * Filters the versions of a tool by the `minCb` ranges of its data, to the
 * releases the given containerbase version can install.
 *
 * The data lists the newest release first. A range covers its `version` and
 * every version above it in the data, prereleases count for the position. A
 * range whose `version` is not listed is ignored. A range is met when its `cb`
 * is valid semver and the containerbase version is the same or newer, a `cb`
 * which is not valid semver is never met. A containerbase version which is not
 * a release, like the development build `0.0.0-PLACEHOLDER`, skips the filter.
 * @param data - the tool-versions data of a tool
 * @param cbVersion - the containerbase version
 * @returns the installable `versions` in the order of the data, and the `cb`
 * values of the unmet ranges as `needed`
 */
export function filterByMinCb(
  data: ToolVersions,
  cbVersion: string,
): { versions: ToolVersion[]; needed: string[] } {
  // the versions up to this index need a newer containerbase: a range which
  // isn't met covers all versions from its start up to the newest one
  let unmet = -1;
  const needed: string[] = [];
  if (isReleaseVersion(cbVersion)) {
    for (const range of data.minCb ?? []) {
      const start = data.versions.findIndex((v) => v.version === range.version);
      if (
        start >= 0 &&
        !(semverValid(range.cb) !== null && semverGte(cbVersion, range.cb))
      ) {
        unmet = Math.max(unmet, start);
        needed.push(range.cb);
      }
    }
  }
  return { versions: data.versions.slice(unmet + 1), needed };
}

/**
 * Lists the containerbase version each tool version needs, by the `minCb`
 * ranges of its data.
 *
 * The data lists the newest release first. A range covers its `version` and
 * every version above it in the data, prereleases count for the position. A
 * range whose `version` is not listed is ignored. A version covered by several
 * ranges needs the newest `cb`, a `cb` which is not valid semver is never met
 * and so wins over the valid ones, the first of several invalid ones is kept.
 * @param data - the tool-versions data of a tool
 * @returns the needed `cb` by version, versions without a covering range are
 * not listed
 */
export function minCbByVersion(data: ToolVersions): Map<string, string> {
  const result = new Map<string, string>();
  for (const range of data.minCb ?? []) {
    const start = data.versions.findIndex((v) => v.version === range.version);
    for (let i = 0; i <= start; i++) {
      const version = data.versions[i]!.version;
      const current = result.get(version);
      if (
        current === undefined ||
        (semverValid(current) !== null &&
          (semverValid(range.cb) === null || semverGt(range.cb, current)))
      ) {
        result.set(version, range.cb);
      }
    }
  }
  return result;
}
