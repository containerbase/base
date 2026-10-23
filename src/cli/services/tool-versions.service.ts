import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { inject, injectable } from 'inversify';
import { ToolVersions } from '../../../packages/base/src/tool-versions-schema.ts';
import type { ToolVersions as ToolVersionsData } from '../../../packages/base/src/tool-versions-types.ts';
import { logger } from '../utils/index.ts';
import { HttpService, toolVersionsTimeout } from './http.service.ts';
import { PathService } from './path.service.ts';

/** The published tool-versions data of the `v1` format, one file per tool. */
export const onlineToolVersionsUrl =
  'https://containerbase.github.io/tool-versions/v1/';

type Cache = Map<string, Promise<ToolVersionsData | undefined>>;

/**
 * Reads the tool-versions data of a tool, from the image or online.
 *
 * Only the file of the requested tool is read, lazily, and checked against the
 * schema and its `tool` field. The image build verifies the embedded files, so
 * there is no integrity check and no index lookup at runtime for them. The
 * online data gets only the schema and `tool` field checks.
 */
@injectable()
export class ToolVersionsService {
  @inject(PathService)
  private readonly pathSvc!: PathService;

  @inject(HttpService)
  private readonly http!: HttpService;

  private readonly embedded: Cache = new Map();
  private readonly online: Cache = new Map();

  /**
   * The embedded versions of a tool, read once per instance.
   * @returns `undefined` when the tool has no readable and valid embedded file
   */
  getVersions(tool: string): Promise<ToolVersionsData | undefined> {
    return this.cached(this.embedded, tool, () => this.read(tool));
  }

  /**
   * The published versions of a tool, fetched once per instance through the
   * http service, so proxies and url replacements apply.
   * @returns `undefined` when the file can't be fetched or is invalid
   */
  getOnlineVersions(tool: string): Promise<ToolVersionsData | undefined> {
    return this.cached(this.online, tool, () => this.fetch(tool));
  }

  /** Returns the cached load of a tool, or starts and caches it. */
  private cached(
    cache: Cache,
    tool: string,
    load: () => Promise<ToolVersionsData | undefined>,
  ): Promise<ToolVersionsData | undefined> {
    let versions = cache.get(tool);
    if (!versions) {
      versions = load();
      cache.set(tool, versions);
    }
    return versions;
  }

  /** Reads `v1/<tool>.json` of the image and validates it, never throws. */
  private async read(tool: string): Promise<ToolVersionsData | undefined> {
    const file = join(this.pathSvc.usrPath, 'tool-versions/v1', `${tool}.json`);
    try {
      return this.validate(
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

  /** Fetches the published `<tool>.json` and validates it, never throws. */
  private async fetch(tool: string): Promise<ToolVersionsData | undefined> {
    const url = `${onlineToolVersionsUrl}${tool}.json`;
    try {
      return this.validate(
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
   * Checks the data against the schema, and that it belongs to the tool.
   * @param source - where the data comes from, for the log
   * @param location - the file path or url of the data, for the log
   * @returns `undefined` when the data is invalid or of another tool
   */
  private validate(
    tool: string,
    data: unknown,
    source: string,
    location: string,
  ): ToolVersionsData | undefined {
    const result = ToolVersions.safeParse(data);
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
