import { inject, injectable } from 'inversify';
import type { ToolFile } from '../../../packages/base/src/tool-versions-types.ts';
import { getDistro, logger } from '../utils/index.ts';
import { EnvService } from './env.service.ts';
import {
  type HttpChecksumType,
  HttpChecksumTypes,
  HttpService,
} from './http.service.ts';
import { ToolVersionsService } from './tool-versions.service.ts';

/**
 * Picks and downloads the files of a tool version from the tool-versions data,
 * verified against their checksums.
 */
@injectable()
export class ToolFilesService {
  @inject(EnvService)
  private readonly env!: EnvService;

  @inject(HttpService)
  private readonly http!: HttpService;

  @inject(ToolVersionsService)
  private readonly toolVersions!: ToolVersionsService;

  /**
   * Downloads the file of a version for the host from the tool-versions data,
   * verified against its checksum, see {@link findToolFile} and
   * {@link downloadListedFile}. A missing file is logged, unless there is no
   * data at all.
   *
   * @param distro - the distro codename to pick the file for, by default the
   * host's
   * @param filter - only picks from the files it accepts, for tools with
   * several kinds of files per host, by default all
   * @returns the downloaded file, or `undefined` when there is no data or no
   * file for the host with a supported checksum, so the installer can use its
   * own download logic
   * @throws when the download fails
   */
  async downloadToolFile(
    tool: string,
    version: string,
    distro?: string,
    filter?: (file: ToolFile) => boolean,
  ): Promise<string | undefined> {
    const found = await this.findToolFile(tool, version, distro, filter);
    if (!found) {
      return undefined;
    }
    if (!found.file) {
      logger.debug(
        { tool, version, arch: this.env.arch, distro: found.distro },
        'no tool-versions file for the host',
      );
      return undefined;
    }
    return await this.downloadListedFile(found.file);
  }

  /**
   * Downloads the file named `name` of a version for the host from the
   * tool-versions data, see {@link downloadToolFile}. A tool can list several
   * files per host, eg. a musl and a glibc build.
   */
  async downloadNamedToolFile(
    tool: string,
    version: string,
    name: string,
  ): Promise<string | undefined> {
    return await this.downloadToolFile(
      tool,
      version,
      undefined,
      (f) => f.name === name,
    );
  }

  /**
   * Downloads the file of a version for the host distro from the tool-versions
   * data like {@link downloadToolFile}, else the one for `fallback`, eg. the
   * distro whose prebuild a newer ubuntu release uses. The data is cached, so
   * the second lookup is cheap. Using the fallback is logged, the caller's own
   * download for it then follows when there is no file for it either.
   *
   * @param host - the codename of the host distro
   * @param fallback - the codename to try when the host has no file, only
   * tried when it differs from `host`
   * @returns the downloaded file, or `undefined` when neither has a file
   * @throws when the download fails
   */
  async downloadDistroToolFile(
    tool: string,
    version: string,
    host: string,
    fallback: string,
  ): Promise<string | undefined> {
    const file = await this.downloadToolFile(tool, version, host);
    if (file || fallback === host) {
      return file;
    }
    logger.debug(`Using ${fallback} file for ${tool} on ${host}`);
    return await this.downloadToolFile(tool, version, fallback);
  }

  /**
   * Picks the file of a version for the host from the tool-versions data,
   * without downloading it or logging a miss. Never downloads without
   * verification: the files of the host with an algorithm the http service
   * doesn't know are skipped with a warning before the pick, so a more
   * specific one can't hide a usable file.
   *
   * @param distro - the distro codename to pick the file for, by default the
   * host's
   * @param filter - only picks from the files it accepts, by default all
   * @returns `undefined` when there is no data, else the file, if any, and
   * the distro codename it was picked for
   */
  async findToolFile(
    tool: string,
    version: string,
    distro?: string,
    filter: (file: ToolFile) => boolean = () => true,
  ): Promise<{ file: ToolFile | undefined; distro: string } | undefined> {
    const data = await this.toolVersions.getVersionFiles(tool, version);
    if (!data) {
      return undefined;
    }
    const code = distro ?? (await getDistro()).versionCode;
    const usable = data.files
      .filter((f) => filter(f) && fitsHost(f, this.env.arch, code))
      .filter((f) => {
        if (parseChecksum(f.checksum)) {
          return true;
        }
        logger.warn(
          { tool, version, checksum: f.checksum },
          'unsupported tool-versions file checksum',
        );
        return false;
      });
    return {
      file: selectToolFile(usable, this.env.arch, code),
      distro: code,
    };
  }

  /**
   * Downloads a file picked by {@link findToolFile}, verified against its
   * checksum, as a file of its name. The cache folder is keyed by the url, so
   * it only shares the cache file with the installer's own download when that
   * uses the same url and file name. A name which isn't a plain file name is
   * ignored by the http service, see `HttpService.download`. Url replacements
   * and the cache apply.
   *
   * @throws when the download fails
   */
  async downloadListedFile(file: ToolFile): Promise<string> {
    // `findToolFile` only picks files with a supported checksum
    const { type, value } = parseChecksum(file.checksum)!;
    return await this.http.download({
      url: file.url,
      checksumType: type,
      expectedChecksum: value,
      fileName: file.name,
    });
  }
}

/**
 * Splits a `<algorithm>:<hex>` checksum of the tool-versions data.
 * @returns `undefined` for an algorithm the http service can't verify
 */
function parseChecksum(
  checksum: string,
): { type: HttpChecksumType; value: string } | undefined {
  const [algorithm, value] = checksum.split(':');
  const type = HttpChecksumTypes.find((t) => t === algorithm);
  return type && value ? { type, value } : undefined;
}

/**
 * Whether a file fits a host: of its arch or for any arch, and of its distro
 * or for any distro.
 */
function fitsHost(file: ToolFile, arch: string, distro: string): boolean {
  return (
    (!file.arch || file.arch === arch) &&
    (!file.distro || file.distro === distro)
  );
}

/**
 * Picks the file for a host from the files of a version: one of the arch or
 * for any arch, and of the distro or for any distro. An arch or distro
 * specific file is preferred over a generic one, the first one wins a tie.
 * @returns `undefined` when no file fits the host
 */
export function selectToolFile(
  files: readonly ToolFile[],
  arch: string,
  distro: string,
): ToolFile | undefined {
  let best: ToolFile | undefined;
  let bestScore = -1;
  for (const file of files) {
    if (!fitsHost(file, arch, distro)) {
      continue;
    }
    const score = (file.arch ? 1 : 0) + (file.distro ? 1 : 0);
    if (score > bestScore) {
      best = file;
      bestScore = score;
    }
  }
  return best;
}
