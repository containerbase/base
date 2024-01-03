import { injectable } from 'inversify';
import type { EnvService, HttpService } from '../services';

export const TOOL_VERSION_RESOLVER = Symbol('TOOL_VERSION_RESOLVER');

@injectable()
export abstract class ToolVersionResolver {
  abstract readonly tool: string;

  constructor(
    protected readonly http: HttpService,
    protected readonly env: EnvService,
  ) {}

  abstract resolve(version: string | undefined): Promise<string | undefined>;
}
