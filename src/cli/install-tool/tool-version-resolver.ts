import { inject, injectable } from 'inversify';
import { HttpService } from '../services';

export const TOOL_VERSION_RESOLVER = Symbol('TOOL_VERSION_RESOLVER');

@injectable()
export abstract class ToolVersionResolver {
  abstract readonly tool: string;

  constructor(@inject(HttpService) protected readonly http: HttpService) {}

  abstract resolve(version: string | undefined): Promise<string | undefined>;
}
