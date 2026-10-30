import { arch } from 'node:os';
import { join, resolve } from 'node:path';
import { env, geteuid } from 'node:process';
import { isNonEmptyString } from '@sindresorhus/is';
import { bindingScopeValues, injectable } from 'inversify';
import {
  type UrlReplacement,
  getUrlReplacements,
  replaceUrl,
} from '../../../packages/base/src/url.ts';
import {
  type Arch,
  hasUnitlessPart,
  isInside,
  logger,
  toMs,
  warnOnce,
} from '../utils/index.ts';

/** The default max age of the embedded tool-versions data, 24 hours. */
const defaultMaxAge = 24 * 60 * 60 * 1000;

@injectable(bindingScopeValues.Singleton)
export class EnvService {
  readonly arch: Arch;
  private uid: number;
  private replacements: UrlReplacement[] | undefined;
  private ignoredTools: Set<string> | undefined;

  /**
   * Reads the effective user id and maps the node architecture to `amd64` or
   * `arm64`.
   *
   * @throws on an unsupported architecture
   */
  constructor() {
    this.uid = geteuid?.() ?? 0; // fallback should never happen on linux
    switch (arch()) {
      case 'arm64':
        this.arch = 'arm64';
        break;
      case 'x64':
        this.arch = 'amd64';
        break;
      default:
        // should never happen
        throw new Error('Unsupported architecture: ' + arch());
    }
  }

  /** The apt proxy from `APT_HTTP_PROXY`. */
  get aptProxy(): string | null {
    return env.APT_HTTP_PROXY ?? null;
  }

  /** The download cache folder from `CONTAINERBASE_CACHE_DIR`. */
  get cacheDir(): string | null {
    return env.CONTAINERBASE_CACHE_DIR ?? null;
  }

  /**
   * The fill level in percent of the file system holding the download cache,
   * from which on the oldest cached files are removed, from
   * `CONTAINERBASE_MAX_ALLOCATED_DISK`. Defaults to `100` when unset or not an
   * integer.
   */
  get maxAllocatedDisk(): number {
    const value = Number.parseInt(
      env.CONTAINERBASE_MAX_ALLOCATED_DISK ?? '',
      10,
    );
    return Number.isNaN(value) ? 100 : value;
  }

  /**
   * The containerbase temp folder from `CONTAINERBASE_TMP_DIR`, defaults to
   * `/tmp/containerbase` when unset or empty. Trailing slashes are dropped.
   * A path that is not absolute and normalized, or that is `/tmp` or below it,
   * is ignored with a warning.
   *
   * The checked value is written back to `CONTAINERBASE_TMP_DIR`, so child
   * processes, eg. the v2 shell tools, use it and an invalid value is only
   * reported once.
   */
  get containerbaseTmpDir(): string {
    const defaultDir = this.defaultContainerbaseTmpDir;
    const value = env.CONTAINERBASE_TMP_DIR;
    let dir = defaultDir;
    if (isNonEmptyString(value)) {
      const trimmed = value.replace(/\/+$/, '');
      if (
        trimmed === defaultDir ||
        (resolve(trimmed) === trimmed && !isInside(this.tmpDir, trimmed))
      ) {
        dir = trimmed;
      } else {
        logger.warn(
          { dir: value },
          'Ignoring invalid CONTAINERBASE_TMP_DIR, using the default',
        );
      }
    }
    env.CONTAINERBASE_TMP_DIR = dir;
    return dir;
  }

  /** The default containerbase temp folder, `/tmp/containerbase`. */
  get defaultContainerbaseTmpDir(): string {
    return join(this.tmpDir, 'containerbase');
  }

  /** The home folder of the current user, from `HOME`. */
  get home(): string {
    // TODO: validate
    return env.HOME!;
  }

  /** Whether the process runs as root. */
  get isRoot(): boolean {
    return this.uid === 0;
  }

  /**
   * Root directory of the container.
   * `globalThis.rootDir` is set by test setup only, it's replaced by `null` on production.
   */
  get rootDir(): string {
    return globalThis.rootDir ?? join('/', '');
  }

  /**
   * Home directory of root
   */
  get rootHome(): string {
    return join(this.rootDir, 'root');
  }

  /** The temp folder of the container. */
  get tmpDir(): string {
    return join(this.rootDir, 'tmp');
  }

  /** The home folder of the containerbase user, from `USER_HOME`. */
  get userHome(): string {
    return env.USER_HOME ?? join(this.rootDir, 'home', this.userName);
  }

  /** The name of the containerbase user, from `USER_NAME`. */
  get userName(): string {
    return env.USER_NAME ?? 'ubuntu';
  }

  /** The id of the containerbase user, from `USER_ID`. */
  get userId(): number {
    return parseInt(env.USER_ID ?? '12021', 10);
  }

  /** The primary group id of the containerbase user, from `PRIMARY_GROUP_ID`. */
  get primaryGroupId(): number {
    return parseInt(env.PRIMARY_GROUP_ID ?? '0', 10);
  }

  /** The mode for created folders and binaries, group writable unless root. */
  get umask(): number {
    return this.isRoot ? 0o755 : 0o775;
  }

  /**
   * The containerbase version: the release version, `0.0.0-PLACEHOLDER` for
   * development builds, CI builds add the commit sha as build metadata.
   */
  get version(): string {
    return globalThis.CONTAINERBASE_VERSION ?? '0.0.0-PLACEHOLDER';
  }

  /**
   * Whether the online tool-versions data is never fetched, set by
   * `CONTAINERBASE_RESOLVER_OFFLINE=true`, in any case. Any other value but
   * `false` or an empty one is logged as a warning, once, and doesn't turn it
   * off.
   */
  get resolverOffline(): boolean {
    const value = env.CONTAINERBASE_RESOLVER_OFFLINE ?? '';
    const lower = value.toLowerCase();
    if (lower === 'true') {
      return true;
    }
    if (lower !== '' && lower !== 'false') {
      warnOnce('Invalid CONTAINERBASE_RESOLVER_OFFLINE, use true or false', {
        value,
      });
    }
    return false;
  }

  /**
   * The age in milliseconds up to which the embedded tool-versions data is
   * used without looking up the online data, from
   * `CONTAINERBASE_RESOLVER_MAX_AGE`, like `24h`, `2 days` or `1 day 2h`, a
   * month counts as 30 days. Defaults to 24 hours when unset, an invalid
   * value or one with a negative part is logged as a warning and uses the
   * default. A part without a unit, like `24` or the `30` of `1h30`, is
   * milliseconds, like for Renovate, which is logged as a warning too. Each
   * warning is logged once.
   */
  get resolverMaxAge(): number {
    const value = env.CONTAINERBASE_RESOLVER_MAX_AGE;
    if (!isNonEmptyString(value)) {
      return defaultMaxAge;
    }
    const age = toMs(value);
    if (age === null) {
      warnOnce(
        'Invalid CONTAINERBASE_RESOLVER_MAX_AGE, using the default of 24 hours',
        { value },
      );
      return defaultMaxAge;
    }
    if (hasUnitlessPart(value)) {
      warnOnce(
        'CONTAINERBASE_RESOLVER_MAX_AGE has a number without a unit, it is read as milliseconds',
        { value },
      );
    }
    return age;
  }

  /** Whether tool tests are skipped, set by `SKIP_VERSION`. */
  get skipTests(): boolean {
    return !!env.SKIP_VERSION;
  }

  /**
   * The url replacements from the `URL_REPLACE_<n>_FROM` and
   * `URL_REPLACE_<n>_TO` environment variables, in numerical order.
   */
  get urlReplacements(): UrlReplacement[] {
    if (this.replacements) {
      return this.replacements;
    }

    const { replacements, invalid } = getUrlReplacements(env);
    for (const from of invalid) {
      const to = from.replace(/_FROM$/, '_TO');
      logger.warn(
        `Invalid URL replacement: ${from}=${env[from]} ${to}=${env[to]}`,
      );
    }

    return (this.replacements = replacements);
  }

  /** Whether the tool is listed in `IGNORED_TOOLS`, ignoring case. */
  public isToolIgnored(tool: string): boolean {
    this.ignoredTools ??= new Set(
      (env.IGNORED_TOOLS ?? '').toUpperCase().split(','),
    );

    return this.ignoredTools.has(tool.toUpperCase());
  }

  /**
   * Replace the source url with the optional cdn and replacement urls
   * @param src the source url
   * @param cdn should the cdn url be used
   * @returns the replaced url
   */
  public replaceUrl(src: string, cdn = true): string {
    const tgt = replaceUrl(
      src,
      this.urlReplacements,
      cdn ? env.CONTAINERBASE_CDN : undefined,
    );
    if (tgt !== src) {
      logger.debug({ src, tgt }, 'url replaced');
    }
    return tgt;
  }
}
