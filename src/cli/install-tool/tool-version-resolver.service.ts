import { injectable, multiInject } from 'inversify';
import {
  TOOL_VERSION_RESOLVER,
  type ToolVersionResolver,
} from './tool-version-resolver.ts';

@injectable()
export class ToolVersionResolverService {
  /** Takes all registered tool version resolvers. */
  constructor(
    @multiInject(TOOL_VERSION_RESOLVER) private resolver: ToolVersionResolver[],
  ) {}

  /**
   * Resolves the version with the tool's resolver, or returns it unchanged
   * when the tool has none.
   */
  async resolve(
    tool: string,
    version: string | undefined,
  ): Promise<string | undefined> {
    const resolver = this.resolver.find((r) => r.tool === tool);
    return (await resolver?.resolve(version)) ?? version;
  }
}
