import { execa } from 'execa';
import { injectable } from 'inversify';
import { InstallRubyBaseService } from './utils';

@injectable()
export class InstallBundlerService extends InstallRubyBaseService {
  override readonly name: string = 'bundler';
}

@injectable()
export class InstallCocoapodsService extends InstallRubyBaseService {
  override readonly name: string = 'cocoapods';

  override async test(_version: string): Promise<void> {
    await execa('pod', ['--version', '--allow-root'], { stdio: 'inherit' });
  }
}
