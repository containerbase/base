import { type UserInfo, arch, userInfo } from 'node:os';
import { injectable } from 'inversify';
import type { Arch } from '../utils';

@injectable()
export class EnvService {
  private userInfo: UserInfo<string>;
  readonly arch: Arch;

  constructor() {
    this.userInfo = userInfo();
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
    return this.userInfo.uid === 0;
  }

  get userHome(): string {
    return process.env.USER_HOME ?? `/home/${this.userName}`;
  }

  get userName(): string {
    return process.env.USER_NAME ?? 'ubuntu';
  }

  get umask(): number {
    return this.isRoot ? 0o755 : 0o775;
  }

  get skipTests(): boolean {
    return !!process.env.SKIP_VERSION;
  }
}
