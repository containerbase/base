import { arch } from 'node:os';
import { join } from 'node:path';
import { env, geteuid } from 'node:process';
import { bindingScopeValues, injectable } from 'inversify';
import { type Arch, logger } from '../utils/index.ts';

export type Replacements = [string, string][];

const compare = (() => {
  const collator = new Intl.Collator('en', {
    sensitivity: 'base',
    numeric: true,
  });
  return (a: string, b: string) => collator.compare(a, b);
})();

@injectable(bindingScopeValues.Singleton)
export class EnvService {
  readonly arch: Arch;
  private uid: number;
  private replacements: Replacements | undefined;
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

  /** The mode for created folders and binaries, group writable unless root. */
  get umask(): number {
    return this.isRoot ? 0o755 : 0o775;
  }

  /** The containerbase version, `dev` for local builds. */
  get version(): string {
    return globalThis.CONTAINERBASE_VERSION ?? 'dev';
  }

  /** Whether tool tests are skipped, set by `SKIP_VERSION`. */
  get skipTests(): boolean {
    return !!env.SKIP_VERSION;
  }

  /**
   * The url replacements from the `URL_REPLACE_<n>_FROM` and
   * `URL_REPLACE_<n>_TO` environment variables, in numerical order.
   */
  get urlReplacements(): [string, string][] {
    if (this.replacements) {
      return this.replacements;
    }

    const replacements: [string, string][] = [];
    const fromRe = /^URL_REPLACE_\d+_FROM$/;

    for (const from of Object.keys(env)
      .filter((key) => fromRe.test(key))
      .sort(compare)) {
      const to = from.replace(/_FROM$/, '_TO');
      if (env[from] && env[to]) {
        replacements.push([env[from], env[to]]);
      } else {
        logger.warn(
          `Invalid URL replacement: ${from}=${env[from]} ${to}=${env[to]}`,
        );
      }
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
    let tgt = src;

    if (env.CONTAINERBASE_CDN && cdn) {
      tgt = src.replace(/^https:\//, env.CONTAINERBASE_CDN.replace(/\/$/, ''));
    }

    const replacements = this.urlReplacements;

    for (const [from, to] of replacements) {
      tgt = tgt.replace(from, to);
    }
    if (tgt !== src) {
      logger.debug({ src, tgt }, 'url replaced');
    }
    return tgt;
  }
}
