import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { inject, injectable } from 'inversify';
import type { z } from 'zod';
import {
  ReleaseInfo,
  ToolVersions,
  VersionFiles,
  VersionIntegrity,
} from '../../../packages/base/src/tool-versions-schema.ts';
import type {
  ReleaseInfo as ReleaseInfoData,
  ToolVersions as ToolVersionsData,
  VersionFiles as VersionFilesData,
  VersionIntegrity as VersionIntegrityData,
} from '../../../packages/base/src/tool-versions-types.ts';
import { logger, warnOnce } from '../utils/index.ts';
import { EnvService } from './env.service.ts';
import { HttpService, toolVersionsTimeout } from './http.service.ts';
import { PathService } from './path.service.ts';

/** The published tool-versions data of the `v1` format, one file per tool. */
export const onlineToolVersionsUrl =
  'https://containerbase.github.io/tool-versions/v1/';

/**
 * The characters of a published version, which is also its file name. Other
 * versions are not published.
 */
const publishedVersion = /^[0-9A-Za-z.+_-]+$/;

type Cache<T> = Map<string, Promise<T | undefined>>;

/**
 * The versions of a tool to resolve from, and where they come from: `online`,
 * `embedded` when the embedded data is current, also with the online data
 * turned off, `offline` when the online data is turned off and the embedded
 * data may be outdated, or `fallback` when the online data can't be loaded
 * and the possibly outdated embedded data replaces it.
 */
export interface ResolveVersions {
  data: ToolVersionsData;
  source: 'online' | 'embedded' | 'offline' | 'fallback';
}

/**
 * Reads the tool-versions data of a tool, from the image or online.
 *
 * Only the file of the requested tool is read, lazily, and checked against the
 * schema and its `tool` field. The image build verifies the embedded files, so
 * there is no integrity check and no index lookup at runtime for them. The
 * online data gets only the schema and `tool` field checks, the online files
 * of a version are also verified against the `<tool>.integrity.json`.
 */
@injectable()
export class ToolVersionsService {
  @inject(PathService)
  private readonly pathSvc!: PathService;

  @inject(HttpService)
  private readonly http!: HttpService;

  @inject(EnvService)
  private readonly env!: EnvService;

  private current: Promise<boolean> | undefined;
  private readonly embedded: Cache<ToolVersionsData> = new Map();
  private readonly online: Cache<ToolVersionsData> = new Map();
  private readonly files: Cache<VersionFilesData> = new Map();
  private readonly integrity: Cache<VersionIntegrityData> = new Map();

  /**
   * The embedded versions of a tool, read once per instance.
   * @returns `undefined` when the tool has no readable and valid embedded file
   */
  getVersions(tool: string): Promise<ToolVersionsData | undefined> {
    return this.cached(this.embedded, tool, () => this.read(tool));
  }

  /**
   * The versions of a tool to resolve from: the online data, unless it is
   * turned off, see {@link EnvService.resolverOffline}, or the embedded data
   * has the tool and is current, see {@link isEmbeddedCurrent}, or can't be
   * loaded, else the embedded data. A tool which only the online data has is
   * looked up online, unless it is turned off. Online data is final, the
   * embedded data is older and can't know more. The source tells whether the
   * embedded data is current, see {@link ResolveVersions}. Only tools without
   * their own resolver read it, so a tool without embedded data while the
   * online data is turned off is logged as a warning, once per tool.
   * @returns `undefined` when the tool has no data
   */
  async getResolveVersions(tool: string): Promise<ResolveVersions | undefined> {
    const offline = this.env.resolverOffline;
    const data = await this.getVersions(tool);
    if (offline) {
      if (!data) {
        warnOnce(
          'No embedded tool-versions data, CONTAINERBASE_RESOLVER_OFFLINE turns the online data off',
          { tool },
        );
        return undefined;
      }
      // only embedded data older than the max age may be outdated
      return {
        data,
        source: (await this.isEmbeddedCurrent()) ? 'embedded' : 'offline',
      };
    }
    if (data && (await this.isEmbeddedCurrent())) {
      return { data, source: 'embedded' };
    }
    const online = await this.getOnlineVersions(tool);
    if (online) {
      return { data: online, source: 'online' };
    }
    return data && { data, source: 'fallback' };
  }

  /**
   * Whether the embedded data is current: it was built within the max age,
   * see {@link EnvService.resolverMaxAge}. Embedded data without a readable
   * `release.json` is not current, so the online data is used like before,
   * and neither is data built in the future, as the clock of the container is
   * behind then. Checked once per instance, so the `release.json` and the max
   * age are read and logged once.
   */
  private isEmbeddedCurrent(): Promise<boolean> {
    return (this.current ??= this.checkEmbeddedCurrent());
  }

  /** Checks whether the embedded data is current, see {@link isEmbeddedCurrent}. */
  private async checkEmbeddedCurrent(): Promise<boolean> {
    const release = await this.readRelease();
    if (!release) {
      return false;
    }
    const age = Date.now() - Date.parse(release.buildTime);
    if (age < 0) {
      // the clock of the container is behind, the age can't be told
      logger.debug(
        { release: release.version, buildTime: release.buildTime },
        'embedded tool-versions data built in the future, using the online data',
      );
      return false;
    }
    const current = age < this.env.resolverMaxAge;
    logger.debug(
      { release: release.version, buildTime: release.buildTime, current },
      'embedded tool-versions data age',
    );
    return current;
  }

  /**
   * The published versions of a tool, fetched once per instance through the
   * http service, so proxies and url replacements apply. Only called when the
   * online data isn't turned off, see {@link getResolveVersions}.
   * @returns `undefined` when the file can't be fetched or is invalid
   */
  private getOnlineVersions(
    tool: string,
  ): Promise<ToolVersionsData | undefined> {
    return this.cached(this.online, tool, () => this.fetch(tool));
  }

  /**
   * The files of a version, read once per instance: the embedded
   * `<tool>/<version>.json` first, else the published one, verified against
   * the published `<tool>.integrity.json`.
   * @returns `undefined` when neither is readable, valid and verified
   */
  getVersionFiles(
    tool: string,
    version: string,
  ): Promise<VersionFilesData | undefined> {
    return this.cached(this.files, `${tool}/${version}`, async () => {
      if (!publishedVersion.test(version)) {
        logger.debug({ tool, version }, 'version without tool-versions files');
        return undefined;
      }
      return (
        (await this.readFiles(tool, version)) ??
        (await this.fetchFiles(tool, version))
      );
    });
  }

  /** Returns the cached load of a key, or starts and caches it. */
  private cached<T>(
    cache: Cache<T>,
    key: string,
    load: () => Promise<T | undefined>,
  ): Promise<T | undefined> {
    let value = cache.get(key);
    if (!value) {
      value = load();
      cache.set(key, value);
    }
    return value;
  }

  /** Reads `v1/<tool>.json` of the image and validates it, never throws. */
  private async read(tool: string): Promise<ToolVersionsData | undefined> {
    const file = join(this.pathSvc.usrPath, 'tool-versions/v1', `${tool}.json`);
    try {
      return this.validate(
        ToolVersions,
        tool,
        JSON.parse(await readFile(file, { encoding: 'utf8' })),
        'embedded',
        file,
      );
    } catch (err) {
      logger.debug({ tool, file, err }, 'no embedded tool-versions data');
      return undefined;
    }
  }

  /**
   * Reads the `release.json` of the embedded data and validates it, never
   * throws.
   */
  private async readRelease(): Promise<ReleaseInfoData | undefined> {
    const file = join(this.pathSvc.usrPath, 'tool-versions/release.json');
    try {
      const result = ReleaseInfo.safeParse(
        JSON.parse(await readFile(file, { encoding: 'utf8' })),
      );
      if (result.success) {
        return result.data;
      }
      logger.debug(
        { file, issue: result.error.issues.slice(0, 1) },
        'invalid embedded tool-versions release',
      );
    } catch (err) {
      logger.debug({ file, err }, 'no embedded tool-versions release');
    }
    return undefined;
  }

  /** Fetches the published `<tool>.json` and validates it, never throws. */
  private async fetch(tool: string): Promise<ToolVersionsData | undefined> {
    const url = `${onlineToolVersionsUrl}${tool}.json`;
    try {
      return this.validate(
        ToolVersions,
        tool,
        await this.http.getJson(
          url,
          { timeout: toolVersionsTimeout },
          // a missing file or an unreachable host is expected, the embedded
          // data is the fallback, so there are no retries
          { attempts: 1, quiet: true },
        ),
        'online',
        url,
      );
    } catch (err) {
      logger.debug({ tool, err }, 'no online tool-versions data');
      return undefined;
    }
  }

  /**
   * Reads `v1/<tool>/<version>.json` of the image and validates it, never
   * throws.
   */
  private async readFiles(
    tool: string,
    version: string,
  ): Promise<VersionFilesData | undefined> {
    const file = join(
      this.pathSvc.usrPath,
      'tool-versions/v1',
      tool,
      `${version}.json`,
    );
    try {
      return this.validateFiles(
        tool,
        version,
        JSON.parse(await readFile(file, { encoding: 'utf8' })),
        'embedded',
        file,
      );
    } catch (err) {
      logger.debug(
        { tool, version, file, err },
        'no embedded tool-versions files',
      );
      return undefined;
    }
  }

  /**
   * Fetches the published `<tool>/<version>.json`, verifies its bytes against
   * the published `<tool>.integrity.json` and validates it, never throws.
   * Nothing is fetched when the online data is turned off, the installer then
   * downloads from its own source.
   */
  private async fetchFiles(
    tool: string,
    version: string,
  ): Promise<VersionFilesData | undefined> {
    if (this.env.resolverOffline) {
      logger.debug({ tool, version }, 'online tool-versions files turned off');
      return undefined;
    }
    // the version is the file name, a `+` must be url encoded
    const url = `${onlineToolVersionsUrl}${tool}/${encodeURIComponent(version)}.json`;
    try {
      const [text, integrity] = await Promise.all([
        this.http.get(
          url,
          { timeout: toolVersionsTimeout },
          // a missing file or an unreachable host is expected, the installer
          // has its own download logic as fallback
          { attempts: 1, quiet: true },
        ),
        this.cached(this.integrity, tool, () => this.fetchIntegrity(tool)),
      ]);
      const expected =
        integrity && Object.hasOwn(integrity.versions, version)
          ? integrity.versions[version]
          : undefined;
      if (!expected) {
        logger.debug({ tool, version }, 'no online tool-versions integrity');
        return undefined;
      }
      const actual = `sha256-${createHash('sha256').update(text).digest('base64')}`;
      if (actual !== expected) {
        logger.warn(
          { tool, version, url, expected, actual },
          'online tool-versions files integrity mismatch',
        );
        return undefined;
      }
      return this.validateFiles(tool, version, JSON.parse(text), 'online', url);
    } catch (err) {
      logger.debug({ tool, version, err }, 'no online tool-versions files');
      return undefined;
    }
  }

  /**
   * Fetches the published `<tool>.integrity.json` and validates it, never
   * throws.
   */
  private async fetchIntegrity(
    tool: string,
  ): Promise<VersionIntegrityData | undefined> {
    const url = `${onlineToolVersionsUrl}${tool}.integrity.json`;
    try {
      return this.validate(
        VersionIntegrity,
        tool,
        await this.http.getJson(
          url,
          { timeout: toolVersionsTimeout },
          { attempts: 1, quiet: true },
        ),
        'online',
        url,
      );
    } catch (err) {
      logger.debug({ tool, err }, 'no online tool-versions integrity');
      return undefined;
    }
  }

  /**
   * Checks the files of a version against the schema, and that they belong to
   * the tool and version.
   * @param source - where the data comes from, for the log
   * @param location - the file path or url of the data, for the log
   * @returns `undefined` when the data is invalid or of another tool or version
   */
  private validateFiles(
    tool: string,
    version: string,
    data: unknown,
    source: string,
    location: string,
  ): VersionFilesData | undefined {
    const files = this.validate(VersionFiles, tool, data, source, location);
    if (files && files.version !== version) {
      logger.debug(
        { tool, version, location, dataVersion: files.version },
        `${source} tool-versions files of another version`,
      );
      return undefined;
    }
    return files;
  }

  /**
   * Checks the data against the schema, and that it belongs to the tool.
   * @param schema - the schema of the file
   * @param source - where the data comes from, for the log
   * @param location - the file path or url of the data, for the log
   * @returns `undefined` when the data is invalid or of another tool
   */
  private validate<T extends { tool: string }>(
    schema: z.ZodType<T>,
    tool: string,
    data: unknown,
    source: string,
    location: string,
  ): T | undefined {
    const result = schema.safeParse(data);
    if (!result.success) {
      logger.debug(
        // the first issue is enough to find the problem
        { tool, location, issue: result.error.issues.slice(0, 1) },
        `invalid ${source} tool-versions data`,
      );
      return undefined;
    }
    if (result.data.tool !== tool) {
      logger.debug(
        { tool, location, dataTool: result.data.tool },
        `${source} tool-versions data of another tool`,
      );
      return undefined;
    }
    return result.data;
  }
}
