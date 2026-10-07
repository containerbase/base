import fs from 'node:fs/promises';
import { join } from 'node:path';
import { isNonEmptyStringAndNotWhitespace } from '@sindresorhus/is';
import { injectFromHierarchy, injectable } from 'inversify';
import { z } from 'zod';
import { BaseInstallService } from '../../install-tool/base-install.service.ts';
import {
  ToolVersionResolver,
  isPartialVersion,
  partialVersionHelp,
} from '../../install-tool/tool-version-resolver.ts';
import { semverCoerce, semverGte } from '../../utils/index.ts';

/**
 * The newest of the versions, compared coerced, so entries like `4.9` count
 * as `4.9.0`.
 * @returns the newest version as listed, or `undefined` without any
 */
function newest(versions: string[]): string | undefined {
  let result: string | undefined;
  for (const version of versions) {
    if (!result || semverGte(semverCoerce(version)!, semverCoerce(result)!)) {
      result = version;
    }
  }
  return result;
}

@injectable()
@injectFromHierarchy()
export class NugetInstallService extends BaseInstallService {
  readonly name = 'nuget';
  override parent = 'mono';

  /**
   * Downloads `nuget.exe` into the versioned `bin` folder with a wrapper that
   * runs it with mono. No checksums are verified.
   */
  override async install(version: string): Promise<void> {
    const baseUrl = `https://dist.nuget.org/win-x86-commandline/v${version}/`;
    const filename = `${this.name}.exe`;

    const file = await this.http.download({
      url: `${baseUrl}${filename}`,
      fileName: `${filename}-v${version}`,
    });

    await this.pathSvc.ensureToolPath(this.name);

    const path = await this.pathSvc.createVersionedToolPath(
      this.name,
      version,
      'bin',
    );
    const binary = join(path, filename);
    await fs.copyFile(file, binary);
    // create shell wrapper to be able to execute it with mono
    const wrapper = join(path, this.name);
    await fs.writeFile(wrapper, `#!/bin/sh\nexec mono "${binary}" "$@"\n`);
    await fs.chmod(wrapper, this.envSvc.umask);
  }

  /** Links the `nuget` wrapper into the global bin folder. */
  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');

    await this.shellwrapper({ srcDir: src });
  }

  /** Checks that `nuget help` runs. */
  override async test(_version: string): Promise<void> {
    await this._spawn(this.name, ['help']);
  }
}

const NugetVersion = z.object({
  version: z.string(),
  stage: z.string().optional(),
});

const NugetTools = z.object({
  'nuget.exe': z.array(NugetVersion),
});

@injectable()
@injectFromHierarchy()
export class NugetVersionResolver extends ToolVersionResolver {
  readonly tool = 'nuget';

  override readonly versionHelp = partialVersionHelp;

  /**
   * Resolves a version from dist.nuget.org.
   *
   * - A missing version or `latest` resolves to the newest released and
   *   blessed version.
   * - A major (`6`) or major.minor (`6.11`) version which is no existing
   *   version resolves to the newest matching released and blessed one, in
   *   any feed order. An existing version, like `6.1`, is kept.
   * - Any other version, like a full `X.Y.Z`, is returned unchanged.
   *
   * @throws if a partial version matches no release.
   */
  async resolve(version: string | undefined): Promise<string | undefined> {
    if (!isNonEmptyStringAndNotWhitespace(version) || version === 'latest') {
      const meta = await this.getReleases();
      // we know that the latest version is the first entry, so search for first lts
      return meta.find((v) => v.stage === 'ReleasedAndBlessed')?.version;
    }
    if (isPartialVersion(version)) {
      const meta = await this.getReleases();
      // an existing release of any stage is kept
      if (meta.some((v) => v.version === version)) {
        return version;
      }
      const release = newest(
        meta
          .filter(
            (v) =>
              v.stage === 'ReleasedAndBlessed' &&
              v.version.startsWith(`${version}.`),
          )
          .map((v) => v.version),
      );
      if (!release) {
        throw new Error(`No ${this.tool} release found for version ${version}`);
      }
      return release;
    }
    return version;
  }

  /** Loads the list of nuget.exe releases from dist.nuget.org, newest first. */
  private async getReleases(): Promise<z.infer<typeof NugetVersion>[]> {
    return NugetTools.parse(
      await this.http.getJson('https://dist.nuget.org/tools.json'),
    )['nuget.exe'];
  }
}
