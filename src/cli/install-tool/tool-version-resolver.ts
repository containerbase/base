import { inject, injectable } from 'inversify';
import { EnvService, HttpService } from '../services/index.ts';

export const TOOL_VERSION_RESOLVER = Symbol('TOOL_VERSION_RESOLVER');

/** The version note shared by the tools accepting major or major.minor versions. */
export const partialVersionHelp =
  'A major or major.minor version installs the newest matching release.';

/**
 * Checks if a version is a partial one, a major (`21`) or major.minor (`21.3`)
 * version.
 */
export function isPartialVersion(version: string): boolean {
  return /^\d+(\.\d+)?$/.test(version);
}

@injectable()
export abstract class ToolVersionResolver {
  abstract readonly tool: string;
  @inject(HttpService)
  protected readonly http!: HttpService;
  @inject(EnvService)
  protected readonly env!: EnvService;

  /**
   * A short markdown-ish note on the versions the tool accepts, shown in the
   * install-tool help.
   */
  readonly versionHelp: string | undefined = undefined;

  /**
   * Resolves the requested version, eg. a missing version or `latest` to the
   * latest release.
   */
  abstract resolve(version: string | undefined): Promise<string | undefined>;
}
