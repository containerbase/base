import { arch } from 'node:os';
import { join } from 'node:path';
import { env, geteuid } from 'node:process';
import { injectable } from 'inversify';
import { type Arch, logger } from '../utils';

export type Replacements = [string, string][];

const compare = (() => {
  const collator = new Intl.Collator('en', {
    sensitivity: 'base',
    numeric: true,
  });
  return (a: string, b: string) => collator.compare(a, b);
})();

@injectable()
export class EnvService {
  readonly arch: Arch;
  private uid: number;
  private replacements: Replacements | undefined;
  private ignoredTools: Set<string> | undefined;

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

  get aptProxy(): string | null {
    return env.APT_HTTP_PROXY ?? null;
  }

  get cacheDir(): string | null {
    return env.CONTAINERBASE_CACHE_DIR ?? null;
  }

  get home(): string {
    // TODO: validate
    return env.HOME!;
  }

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

  get tmpDir(): string {
    return join(this.rootDir, 'tmp');
  }

  get userHome(): string {
    return env.USER_HOME ?? join(this.rootDir, 'home', this.userName);
  }

  get userName(): string {
    return env.USER_NAME ?? 'ubuntu';
  }

  get userId(): number {
    return parseInt(env.USER_ID ?? '12021', 10);
  }

  get umask(): number {
    return this.isRoot ? 0o755 : 0o775;
  }

  get version(): string {
    return globalThis.CONTAINERBASE_VERSION ?? 'dev';
  }

  get skipTests(): boolean {
    return !!env.SKIP_VERSION;
  }

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

  public isToolIgnored(tool: string): boolean {
    if (!this.ignoredTools) {
      this.ignoredTools = new Set(
        (env.IGNORED_TOOLS ?? '').toUpperCase().split(','),
      );
    }

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
