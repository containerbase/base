import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { inject, injectable } from 'inversify';
import { ToolVersions } from '../../../packages/base/src/tool-versions-schema.ts';
import type { ToolVersions as ToolVersionsData } from '../../../packages/base/src/tool-versions-types.ts';
import { logger } from '../utils/index.ts';
import { PathService } from './path.service.ts';

/**
 * Reads the tool-versions data embedded in the image.
 *
 * Only the file of the requested tool is read, lazily, and checked against the
 * schema. The image build verifies the rest of the data, so there is no
 * integrity check and no index lookup at runtime.
 */
@injectable()
export class ToolVersionsService {
  @inject(PathService)
  private readonly pathSvc!: PathService;

  private readonly cache = new Map<
    string,
    Promise<ToolVersionsData | undefined>
  >();

  /**
   * The embedded versions of a tool, read once per instance.
   * @returns `undefined` when the tool has no readable and valid embedded file
   */
  getVersions(tool: string): Promise<ToolVersionsData | undefined> {
    let versions = this.cache.get(tool);
    if (!versions) {
      versions = this.read(tool);
      this.cache.set(tool, versions);
    }
    return versions;
  }

  /** Reads `v1/<tool>.json` and validates it, never throws. */
  private async read(tool: string): Promise<ToolVersionsData | undefined> {
    const file = join(this.pathSvc.usrPath, 'tool-versions/v1', `${tool}.json`);
    try {
      return this.validate(
        tool,
        JSON.parse(await readFile(file, { encoding: 'utf8' })),
        file,
      );
    } catch (err) {
      logger.debug({ tool, file, err }, 'no embedded tool-versions data');
      return undefined;
    }
  }

  /**
   * Checks the data against the schema, and that it belongs to the tool.
   * @param location - the file path of the data, for the log
   * @returns `undefined` when the data is invalid or of another tool
   */
  private validate(
    tool: string,
    data: unknown,
    location: string,
  ): ToolVersionsData | undefined {
    const result = ToolVersions.safeParse(data);
    if (!result.success) {
      logger.debug(
        // the first issue is enough to find the problem
        { tool, location, issue: result.error.issues.slice(0, 1) },
        'invalid embedded tool-versions data',
      );
      return undefined;
    }
    if (result.data.tool !== tool) {
      logger.debug(
        { tool, location, dataTool: result.data.tool },
        'embedded tool-versions data of another tool',
      );
      return undefined;
    }
    return result.data;
  }
}
