import { arch } from 'node:os';
import { geteuid } from 'node:process';
import { injectable } from 'inversify';
import type { Arch } from '../utils';

@injectable()
export class EnvService {
  readonly arch: Arch;
  private uid: number;

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

  get isRoot(): boolean {
    return this.uid === 0;
  }

  get userHome(): string {
    return process.env.USER_HOME ?? `/home/${this.userName}`;
  }

  get userName(): string {
    return process.env.USER_NAME ?? 'ubuntu';
  }

  get userId(): number {
    return parseInt(process.env.USER_ID ?? '1000', 10);
  }

  get umask(): number {
    return this.isRoot ? 0o755 : 0o775;
  }

  get skipTests(): boolean {
    return !!process.env.SKIP_VERSION;
  }
}
