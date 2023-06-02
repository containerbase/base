import { type UserInfo, userInfo } from 'node:os';
import { injectable } from 'inversify';

@injectable()
export class EnvService {
  private userInfo: UserInfo<string>;

  constructor() {
    this.userInfo = userInfo();
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
}
