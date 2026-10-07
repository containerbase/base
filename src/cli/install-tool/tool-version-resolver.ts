import { inject, injectable } from 'inversify';
import { EnvService, HttpService } from '../services/index.ts';

export const TOOL_VERSION_RESOLVER = Symbol('TOOL_VERSION_RESOLVER');

/** The version note shared by the tools accepting major or major.minor versions. */
export const partialVersionHelp =
  'A major or major.minor version installs the newest matching release.';

/**
 * Checks if a version is a partial one, a major (`21`) or major.minor (`21.3`)
 * version.
 */
export function isPartialVersion(version: string): boolean {
  return /^\d+(\.\d+)?$/.test(version);
}

/**
 * Compares two versions segment by segment, a missing segment counts as `0`,
 * so `4.9` equals `4.9.0`. Segments are compared numerically, a non-numeric
 * one is compared as text, with the digits in it compared as numbers.
 * @returns a negative number if `a` is older, a positive one if it is newer,
 * else `0`
 */
function compareSegments(a: string, b: string): number {
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
 * The newest of the versions, independent of their order. Dot-separated
 * segments are compared one by one, so `6.1.7.10` is newer than `6.1.7.9`,
 * which is newer than `6.1.7`, and entries like `4.9` count as `4.9.0`. Of
 * equal versions the first one wins.
 *
 * Expects release versions only: a prerelease like `1.0.0.rc1` would rank
 * above its release `1.0.0`, so callers filter prereleases out first.
 * @returns the newest version as listed, or `undefined` without any
 */
export function newestVersion(versions: string[]): string | undefined {
  let result: string | undefined;
  for (const version of versions) {
    if (!result || compareSegments(version, result) > 0) {
      result = version;
    }
  }
  return result;
}

@injectable()
export abstract class ToolVersionResolver {
  abstract readonly tool: string;
  @inject(HttpService)
  protected readonly http!: HttpService;
  @inject(EnvService)
  protected readonly env!: EnvService;

  /**
   * A short markdown-ish note on the versions the tool accepts, shown in the
   * install-tool help.
   */
  readonly versionHelp: string | undefined = undefined;

  /**
   * Resolves the requested version, eg. a missing version or `latest` to the
   * latest release.
   */
  abstract resolve(version: string | undefined): Promise<string | undefined>;
}
