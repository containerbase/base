import { isNonEmptyStringAndNotWhitespace } from '@sindresorhus/is';
import { inject, injectable, multiInject } from 'inversify';
import semverGte from 'semver/functions/gte';
import semverValid from 'semver/functions/valid';
import {
  filterByMinCb,
  minCbByVersion,
} from '../../../packages/base/src/min-cb.ts';
import { isReleaseVersion } from '../../../packages/base/src/release-version.ts';
import { DistroCode } from '../../../packages/base/src/schema.ts';
import type { ToolVersions } from '../../../packages/base/src/tool-versions-types.ts';
import { EnvService, ToolVersionsService } from '../services/index.ts';
import { getDistro, logger } from '../utils/index.ts';
import {
  type DataField,
  TOOL_VERSION_RESOLVER,
  type ToolVersionResolver,
  isPartialVersion,
} from './tool-version-resolver.ts';

/**
 * The architecture and the distro codename the tool is installed on, and the
 * running containerbase version, which may be a development build.
 */
interface Host {
  arch: string;
  distro: string;
  cb: string;
}

/**
 * The distros whose files a release can use on the host distro: the host
 * distro and every older Ubuntu release, as the installers use those builds on
 * newer releases, like the jammy prebuilds on noble and resolute. A tool with a
 * `distroMinVersion` for the host distro has its own floor there, eg. swift or
 * php on resolute, so only the host distro builds count.
 * @returns the accepted distro codenames, none for an unknown distro
 */
function hostDistros(data: ToolVersions, distro: string): string[] {
  if (data.distroMinVersion?.[distro] !== undefined) {
    return [distro];
  }
  // oldest first; Ubuntu only, other distro families like Debian need their own
  // ordering and builds. An unknown distro, eg. an unreadable os-release, gets
  // none, so only releases without a `distros` list match.
  const ubuntu: readonly string[] = DistroCode.options;
  return ubuntu.slice(0, ubuntu.indexOf(distro) + 1);
}

/**
 * The release picked from the data, whether it is a deprecated one, and the
 * one picked without the `minCb` filter when that differs, as it needs a newer
 * containerbase.
 */
interface Picked {
  version: string | undefined;
  deprecated: boolean;
  blocked: string | undefined;
}

/**
 * Checks if a version of the data matches a partial version, as the release
 * itself or a release of its line.
 */
function matches(listed: string, version: string): boolean {
  return listed === version || listed.startsWith(`${version}.`);
}

/**
 * The warning for a listed version which needs a newer containerbase. It names
 * the `needed` containerbase version, see {@link minCbByVersion}, or a newer
 * containerbase when it is not valid semver, eg. empty.
 * @param needed - the containerbase version the tool version needs
 * @param outcome - what happens instead, eg. `1.2.3 is used as is`
 */
function newerCbWarning(
  tool: string,
  version: string,
  needed: string | undefined,
  cb: string,
  outcome: string,
): string {
  const valid = semverValid(needed);
  const newer = valid
    ? `containerbase ${valid} or newer`
    : 'a newer containerbase';
  return `${tool} ${version} needs ${newer}, running ${cb}, ${outcome}`;
}

/**
 * The warning for the release which the `minCb` filter skipped, see
 * {@link newerCbWarning}.
 * @param blocked - the skipped release, see {@link pick}
 * @param outcome - what happens instead
 */
function blockedWarning(
  tool: string,
  data: ToolVersions,
  blocked: string,
  host: Host,
  outcome: string,
): string {
  return newerCbWarning(
    tool,
    blocked,
    minCbByVersion(data).get(blocked),
    host.cb,
    outcome,
  );
}

/**
 * Picks a release from the data, prereleases and releases which are not
 * available for the host are skipped. A release is available when it has no
 * `archs` or `distros` list, or the list has the host arch or a distro which
 * runs on the host (see {@link hostDistros}), and the
 * running containerbase version is not below the `cb` of the `minCb` ranges
 * which cover it (see {@link filterByMinCb}). Unmet ranges are logged at debug
 * level when they change the result. The data lists the newest
 * release first, in the versioning of the tool. A missing version or `latest`
 * is the newest release, or the newest LTS release for a tool whose data has
 * LTS flags, even when none is available for the host, then there is no match.
 * For an npm tool, whose data has the `latest` dist-tag, it is that release,
 * also a prerelease, like npm installs it. When the dist-tag is deprecated,
 * isn't available for the host or installable by the running containerbase,
 * it is the newest release which is, and isn't deprecated. A partial version,
 * a major (`20`) or major.minor (`3.12`) one, is the newest release of that
 * line, unless it is a release itself, like `8.10`. For an npm tool it is the
 * `latest` dist-tag when it matches, else the newest release of the line.
 * Every tool skips its deprecated releases for a missing version, `latest`
 * and a partial one, like an npm deprecated release, a PyPI release whose
 * files are all yanked or a gem gone from rubygems, so only deprecated matches
 * are no match, unless `deprecatedFallback` picks them then; an existing
 * release is kept, also a deprecated one.
 * @param deprecatedFallback - whether only deprecated matches pick the newest
 * of them, the deprecated `latest` dist-tag of an npm tool first, for a tool
 * without its own resolver, which has no other lookup
 * @returns the picked release, `undefined` when none matches, whether it is a
 * deprecated one, and the release which the `minCb` filter skipped instead,
 * if any, a deprecated one only when the fallback picks from all releases
 */
function pick(
  tool: string,
  data: ToolVersions,
  version: string | undefined,
  host: Host,
  deprecatedFallback = false,
): Picked {
  const { versions: installable, needed } = filterByMinCb(data, host.cb);
  const stable = data.versions.filter((v) => !v.prerelease);
  const distros = hostDistros(data, host.distro);
  const forHost = (list: typeof data.versions): typeof data.versions =>
    list.filter(
      (v) =>
        (!v.archs || v.archs.includes(host.arch)) &&
        (!v.distros || v.distros.some((d) => distros.includes(d))),
    );

  /**
   * Picks the requested release from the candidates available for the host,
   * newest first, which include the prereleases.
   * @param deprecated - whether deprecated releases are picked too
   */
  const find = (
    candidates: typeof data.versions,
    deprecated = false,
  ): string | undefined => {
    const releases = candidates.filter((v) => !v.prerelease);
    // every tool skips its deprecated releases, like an npm deprecated one, a
    // PyPI release whose files are all yanked or a gem gone from rubygems
    const active = deprecated
      ? releases
      : releases.filter((v) => !v.deprecated);
    if (version === undefined || version === 'latest') {
      if (data.latest !== undefined) {
        // an npm tool: the `latest` dist-tag, also a prerelease, like npm
        // installs it, unless it is deprecated or isn't installable, else the
        // newest release which isn't deprecated
        return (
          candidates.find(
            (v) => v.version === data.latest && (deprecated || !v.deprecated),
          ) ?? active[0]
        )?.version;
      }
      // the LTS flags are read before the host filter (arch, distro and
      // containerbase version), so a tool with LTS releases never falls back
      // to a release which isn't an LTS one
      return (
        data.lts || stable.some((v) => v.lts)
          ? active.find((v) => v.lts)
          : active[0]
      )?.version;
    }
    // an existing release is kept, also a deprecated one, like a pinned one
    if (releases.some((v) => v.version === version)) {
      return version;
    }
    const line = active.filter((v) => matches(v.version, version));
    // an npm tool, like npm: the `latest` dist-tag when it matches, else the
    // newest release of the line
    return (line.find((v) => v.version === data.latest) ?? line[0])?.version;
  };

  /**
   * Picks the installable release and the one the `minCb` filter skips
   * instead, if any.
   * @param deprecated - whether deprecated releases are picked too
   */
  const run = (
    deprecated: boolean,
  ): { version: string | undefined; blocked: string | undefined } => {
    const version = find(forHost(installable), deprecated);
    const unfiltered = needed.length
      ? find(forHost(data.versions), deprecated)
      : version;
    return {
      version,
      blocked: unfiltered === version ? undefined : unfiltered,
    };
  };

  let picked = run(false);
  let deprecated = false;
  if (picked.version === undefined && deprecatedFallback) {
    // nothing which isn't deprecated is installable, so pick again from all
    // releases, also the deprecated ones
    picked = run(true);
    deprecated = picked.version !== undefined;
  }
  // log only when the unmet ranges change the result of this request
  if (picked.blocked !== undefined) {
    logger.debug(
      { tool, running: host.cb, needed },
      'skipping the versions which need a newer containerbase',
    );
  }
  return { ...picked, deprecated };
}

/**
 * The tools without a resolver which publish two-part (`x.y`) releases, like
 * swift `6.2`, a two-part version whose line the data doesn't list is kept
 * without a warning, as the data may not list a new release yet.
 */
// TODO: remove in the next major, when the data is required (#7962)
const twoPartReleaseTools = new Set(['protoc', 'swift']);

/**
 * Logs a warning about the tool-versions data, noting when it is the possibly
 * outdated embedded data.
 * @param outdated - whether the data is the possibly outdated embedded data,
 * the fallback for online data which can't be loaded or is turned off, not
 * current embedded data
 * @param context - the tool and versions, for the log
 */
function warnData(
  message: string,
  outdated: boolean,
  context?: Record<string, unknown>,
): void {
  const text = outdated
    ? `${message} (embedded, possibly outdated tool-versions data)`
    : message;
  if (context) {
    logger.warn(context, text);
  } else {
    logger.warn(text);
  }
}

/**
 * Logs a missing version, `latest` or a partial version without a match in
 * the data. A given version is used as is, a missing one resolves to none. It
 * warns about a release which needs a newer containerbase, a request which
 * only prereleases match, releases which aren't available for the host, or
 * data without such a release. A two-part version of the
 * {@link twoPartReleaseTools} whose line the data doesn't list at all is only
 * logged at debug level.
 * @param blocked - the release the `minCb` filter skipped, see {@link pick}
 * @param outdated - whether the data is the possibly outdated embedded data,
 * the fallback for online data which can't be loaded or is turned off, not
 * current embedded data
 */
function logNoMatch(
  tool: string,
  data: ToolVersions,
  version: string | undefined,
  host: Host,
  blocked: string | undefined,
  outdated: boolean,
): void {
  const requested = version ?? 'latest';
  if (
    blocked === undefined &&
    twoPartReleaseTools.has(tool) &&
    /^\d+\.\d+$/.test(requested) &&
    !data.versions.some((v) => matches(v.version, requested))
  ) {
    logger.debug(
      { tool, version },
      'two-part version not listed in the tool-versions data, used as is',
    );
    return;
  }

  const outcome =
    version === undefined
      ? 'no version is resolved'
      : `${version} is used as is`;
  /** Logs the warning, noting when the data may be outdated. */
  const warn = (message: string): void => warnData(message, outdated);

  if (blocked !== undefined) {
    warn(blockedWarning(tool, data, blocked, host, outcome));
    return;
  }
  const line =
    version === undefined || version === 'latest'
      ? data.versions
      : data.versions.filter((v) => matches(v.version, version));
  // a tool without its own resolver also picks a deprecated release, see pick
  if (line.some((v) => !v.prerelease)) {
    warn(
      `No ${tool} release matches ${requested} for ${host.arch} on ${host.distro}, ${outcome}`,
    );
  } else if (line[0]) {
    warn(
      `No ${tool} release matches ${requested}, only prereleases like ${line[0].version} do, ${outcome}, install an exact prerelease version instead`,
    );
  } else {
    warn(
      `The tool-versions data has no ${tool} release matching ${requested}, ${outcome}`,
    );
  }
}

@injectable()
export class ToolVersionResolverService {
  /**
   * Takes all registered tool version resolvers, the tool-versions data and
   * the env, for the host arch.
   */
  constructor(
    @multiInject(TOOL_VERSION_RESOLVER) private resolver: ToolVersionResolver[],
    @inject(ToolVersionsService) private toolVersions: ToolVersionsService,
    @inject(EnvService) private env: EnvService,
  ) {}

  /**
   * Resolves the version with the tool's resolver. A tool without a resolver
   * is resolved from the tool-versions data, and keeps its version when the
   * data can't answer. A resolver without a
   * {@link ToolVersionResolver.dataField} answers every version. A resolver
   * with a
   * {@link ToolVersionResolver.dataField} resolves a missing, empty or
   * `latest` version and a partial version from the data first, when the
   * embedded data has a file for the tool, so an arbitrary package makes no
   * request for data which doesn't exist. It only gets them when the data
   * can't answer, and gets any other version. The version it resolves for an
   * exact one, like the java build `11.0.24+8` for `11.0.24`, is checked
   * against the `minCb` ranges of the embedded data, which only warns, see
   * {@link checkExact}.
   * @param data - whether the tool-versions data may be read at all,
   * `install-gem`, `install-npm` and `install-pip` turn it off, so they always
   * ask their registry: the resolver then answers any version, and a tool
   * without a resolver keeps its version
   */
  async resolve(
    tool: string,
    version: string | undefined,
    data = true,
  ): Promise<string | undefined> {
    const resolver = this.resolver.find((r) => r.tool === tool);
    const latest =
      !isNonEmptyStringAndNotWhitespace(version) || version === 'latest';
    if (
      data &&
      resolver?.dataField &&
      (latest || isPartialVersion(version)) &&
      (await this.toolVersions.getVersions(tool))
    ) {
      const resolved = await this.resolveFromData(
        tool,
        latest && version !== 'latest' ? undefined : version,
        resolver.dataField,
      );
      if (resolved !== undefined) {
        return resolved;
      }
    }
    // without the data, the resolver answers any version, and a tool without a
    // resolver keeps its version
    if (resolver) {
      const resolved = (await resolver.resolve(version)) ?? version;
      if (data && resolver.dataField && !latest && !isPartialVersion(version)) {
        // the version the resolver answers is the one the data lists, eg. the
        // java build `11.0.24+8` for `11.0.24`, it is never undefined here
        // TODO: fail in the next major instead of only warning (#7962)
        await this.checkExact(tool, resolved!);
      }
      return resolved;
    }
    if (!data) {
      return version;
    }
    return (await this.resolveFromData(tool, version)) ?? version;
  }

  /**
   * Resolves a missing version, `latest` or a partial version from the online
   * tool-versions data, any other version is kept after the {@link checkExact}
   * check. A partial version which the embedded data lists as a release, like
   * `8.10`, is kept without the online lookup, so it doesn't wait for a
   * timeout when offline. The data comes from
   * {@link ToolVersionsService.getResolveVersions}: the online data, unless it
   * is turned off or the embedded data is current, else the embedded data,
   * which is only a possibly outdated fallback when the online data can't be
   * loaded, also for a tool with its own resolver. A resolved version is
   * logged at debug level, or with a warning when the embedded data replaces
   * the online data, a version without a match is logged by
   * {@link logNoMatch}. Only releases available for the host arch
   * and distro, and installable by the running containerbase version
   * (`minCb`), are considered, also for the embedded release check. Only a
   * release version of containerbase filters by `minCb`, any other version,
   * like `0.0.0-PLACEHOLDER`, is a development build and doesn't.
   * @param required - the field the data needs for the resolver of the tool,
   * see {@link ToolVersionResolver.dataField}: data without it is skipped, as
   * the resolver asks its own source; no match is only logged at debug level
   * then, matching releases which all need a newer containerbase with a
   * warning, and the resolver answers like before
   * @returns an exact version as given, else the resolved release, or
   * `undefined` when the data has no match or the tool has no data
   */
  private async resolveFromData(
    tool: string,
    version: string | undefined,
    required?: DataField,
  ): Promise<string | undefined> {
    const given = version !== undefined && version !== 'latest';
    if (given && !isPartialVersion(version)) {
      await this.checkExact(tool, version);
      return version;
    }

    /** Whether the data has the field the resolver of the tool needs. */
    const usable = (data: ToolVersions | undefined): data is ToolVersions =>
      !!data && (!required || data[required] !== undefined);

    const host: Host = {
      arch: this.env.arch,
      distro: (await getDistro()).versionCode,
      cb: this.env.version,
    };
    if (given) {
      const listed = await this.toolVersions.getVersions(tool);
      if (
        usable(listed) &&
        pick(tool, listed, version, host).version === version
      ) {
        logger.debug(
          { tool, version, resolved: version },
          'version resolved from the embedded tool-versions data',
        );
        return version;
      }
    }

    const found = await this.toolVersions.getResolveVersions(tool);
    if (!found) {
      return undefined;
    }
    const { data, source } = found;
    if (!usable(data)) {
      logger.debug(
        { tool, required },
        'tool-versions data without the field, using the resolver',
      );
      return undefined;
    }
    // a tool without its own resolver has no other lookup, so it picks a
    // deprecated release when nothing else matches
    const {
      version: resolved,
      deprecated,
      blocked,
    } = pick(tool, data, version, host, !required);
    // the embedded data may be outdated when the online data was looked up or
    // is turned off, not when it is current
    const outdated = source === 'fallback' || source === 'offline';
    if (resolved === undefined) {
      if (!required) {
        logNoMatch(tool, data, version, host, blocked, outdated);
      } else if (blocked === undefined) {
        logger.debug(
          { tool, version },
          'no match in the tool-versions data, using the resolver',
        );
      } else {
        // TODO: fail in the next major instead of using the resolver (#7962)
        warnData(
          blockedWarning(
            tool,
            data,
            blocked,
            host,
            'the own lookup of the tool is used',
          ),
          outdated,
        );
      }
      return undefined;
    }
    // TODO: fail in the next major instead of using a deprecated release (#7962)
    if (deprecated && blocked !== undefined) {
      // a newer release needs a newer containerbase
      warnData(
        blockedWarning(
          tool,
          data,
          blocked,
          host,
          `the deprecated ${resolved} is used`,
        ),
        outdated,
      );
    } else if (deprecated) {
      warnData(
        resolved === data.latest
          ? 'only deprecated releases match, the deprecated latest dist-tag is used'
          : 'only deprecated releases match, the newest of them is used',
        outdated,
        { tool, version, resolved },
      );
    }
    if (source === 'fallback') {
      warnData('online data not available', true, {
        tool,
        version,
        resolved,
      });
    } else {
      logger.debug(
        { tool, version, resolved },
        `version resolved from the ${source === 'online' ? 'online' : 'embedded'} tool-versions data`,
      );
    }
    return resolved;
  }

  /**
   * Checks an exact version against the `minCb` ranges of the embedded data,
   * and warns when the running containerbase is too old for it. There is no
   * online lookup, so an offline install doesn't wait for a timeout, and a
   * version which the embedded data doesn't list passes, as the data may not
   * have a new release yet. Prereleases are checked like releases, and the
   * host arch and distro are not checked. The needed containerbase version
   * comes from {@link minCbByVersion}. A development build of containerbase
   * skips the check, see {@link filterByMinCb}.
   */
  private async checkExact(tool: string, version: string): Promise<void> {
    const cb = this.env.version;
    if (!isReleaseVersion(cb)) {
      return;
    }
    const data = await this.toolVersions.getVersions(tool);
    if (!data?.versions.some((v) => v.version === version)) {
      return;
    }
    const needed = minCbByVersion(data).get(version);
    // a cb which is not valid semver is never met, like for the filter
    if (
      needed !== undefined &&
      !(semverValid(needed) !== null && semverGte(cb, needed))
    ) {
      logger.warn(
        newerCbWarning(tool, version, needed, cb, `${version} is used as is`),
      );
    }
  }
}
