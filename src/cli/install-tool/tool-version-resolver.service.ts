import { injectable, multiInject } from 'inversify';
import {
  TOOL_VERSION_RESOLVER,
  type ToolVersionResolver,
} from './tool-version-resolver';

@injectable()
export class ToolVersionResolverService {
  constructor(
    @multiInject(TOOL_VERSION_RESOLVER) private resolver: ToolVersionResolver[],
  ) {}

  async resolve(
    tool: string,
    version: string | undefined,
  ): Promise<string | undefined> {
    const resolver = this.resolver.find((r) => r.tool === tool);
    return (await resolver?.resolve(version)) ?? version;
  }
}
