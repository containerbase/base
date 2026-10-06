import { isNonEmptyStringAndNotWhitespace } from '@sindresorhus/is';
import { injectFromHierarchy, injectable } from 'inversify';
import { ToolVersionResolver } from '../../install-tool/tool-version-resolver.ts';
import { resolveLatestJavaVersion } from './utils.ts';

const partialVersion = /^\d+(\.\d+){0,2}$/;

/**
 * Converts a partial version to the maven version range of its releases.
 * @param version - the version, like `11`, `11.0` or `11.0.24`
 * @returns the range, like `[11,12)`, or `undefined` when the version is not partial
 */
export function toVersionRange(version: string): string | undefined {
  if (!partialVersion.test(version)) {
    return undefined;
  }

  const parts = version.split('.');
  const next = [...parts.slice(0, -1), Number(parts.at(-1)) + 1].join('.');
  return `[${version},${next})`;
}

@injectable()
@injectFromHierarchy()
export class JavaVersionResolver extends ToolVersionResolver {
  readonly tool: string = 'java';

  /**
   * Resolves a missing version or `latest` to the newest adoptium lts and a
   * partial version (`11`, `11.0` or `11.0.24`) to its newest ga release.
   * Any other version, like a full version with a build such as `17.0.12+7`,
   * is returned unchanged.
   *
   * @throws when no release matches a partial version
   */
  async resolve(version: string | undefined): Promise<string | undefined> {
    const type = this.tool === 'java-jre' ? 'jre' : 'jdk';

    if (!isNonEmptyStringAndNotWhitespace(version) || version === 'latest') {
      // newest lts first
      return await resolveLatestJavaVersion(this.http, type, this.env.arch);
    }

    const range = toVersionRange(version);
    if (range) {
      const resolved = await resolveLatestJavaVersion(
        this.http,
        type,
        this.env.arch,
        range,
      );
      if (!resolved) {
        throw new Error(`No ${this.tool} release found for version ${version}`);
      }
      return resolved;
    }
    return version;
  }
}

@injectable()
@injectFromHierarchy()
export class JavaJreVersionResolver extends JavaVersionResolver {
  override readonly tool = 'java-jre';
}

@injectable()
@injectFromHierarchy()
export class JavaJdkVersionResolver extends JavaVersionResolver {
  override readonly tool = 'java-jdk';
}
