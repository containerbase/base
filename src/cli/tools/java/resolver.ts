import { isNonEmptyStringAndNotWhitespace } from '@sindresorhus/is';
import { injectable } from 'inversify';
import { ToolVersionResolver } from '../../install-tool/tool-version-resolver';
import { resolveLatestJavaLtsVersion } from './utils';

@injectable()
export class JavaVersionResolver extends ToolVersionResolver {
  readonly tool: string = 'java';

  async resolve(version: string | undefined): Promise<string | undefined> {
    if (!isNonEmptyStringAndNotWhitespace(version) || version === 'latest') {
      // we know that the latest version is the first entry, so search for first lts
      return await resolveLatestJavaLtsVersion(
        this.http,
        this.tool === 'java-jre' ? 'jre' : 'jdk',
        this.env.arch,
      );
    }
    return version;
  }
}

@injectable()
export class JavaJreVersionResolver extends JavaVersionResolver {
  override readonly tool = 'java-jre';
}

@injectable()
export class JavaJdkVersionResolver extends JavaVersionResolver {
  override readonly tool = 'java-jdk';
}
