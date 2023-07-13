import { arch } from 'node:os';
import { env, geteuid } from 'node:process';
import { injectable } from 'inversify';
import { type Arch, logger } from '../utils';

export type Replacements = Record<string, string>;

@injectable()
export class EnvService {
  readonly arch: Arch;
  private uid: number;
  private replacements: Replacements | undefined;

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
        throw new Error('Unsupported architecture');
    }
  }

  get cacheDir(): string | null {
    return env.CONTAINERBASE_CACHE_DIR ?? null;
  }

  get isRoot(): boolean {
    return this.uid === 0;
  }

  get userHome(): string {
    return env.USER_HOME ?? `/home/${this.userName}`;
  }

  get userName(): string {
    return env.USER_NAME ?? 'ubuntu';
  }

  get userId(): number {
    return parseInt(env.USER_ID ?? '1000', 10);
  }

  get umask(): number {
    return this.isRoot ? 0o755 : 0o775;
  }

  get skipTests(): boolean {
    return !!env.SKIP_VERSION;
  }

  get urlReplacements(): Record<string, string> {
    if (this.replacements) {
      return this.replacements;
    }
    const replacements: Record<string, string> = {};
    const fromRe = /^URL_REPLACE_\d+_FROM$/;
    for (const from of Object.keys(env).filter((key) => fromRe.test(key))) {
      const to = from.replace(/_FROM$/, '_TO');
      if (env[from] && env[to]) {
        replacements[env[from]!] = env[to]!;
      } else {
        logger.warn(
          `Invalid URL replacement: ${from}=${env[from]!} ${to}=${env[to]!}`
        );
      }
    }

    return (this.replacements = replacements);
  }
}
