import { createHash } from 'node:crypto';
import type { Container, Newable } from 'inversify';
import type { HttpChecksumType } from '../src/cli/services/http.service.ts';
import { PathService } from '../src/cli/services/index.ts';
import { testContainer } from './di.ts';

export interface ToolContext<T> {
  child: Container;
  svc: T;
  pathSvc: PathService;
}

/**
 * Create a fresh container with the given tool service bound to itself.
 */
export async function toolContext<T>(
  ctor: Newable<T>,
): Promise<ToolContext<T>> {
  const child = await testContainer();
  child.bind(ctor).toSelf();
  return {
    child,
    svc: await child.getAsync(ctor),
    pathSvc: await child.getAsync(PathService),
  };
}

/**
 * The checksum of `content`, as the checksum files of the tool releases list
 * it.
 */
export function checksum(
  content: string,
  type: HttpChecksumType = 'sha256',
): string {
  return createHash(type).update(content).digest('hex');
}
