import { createHash } from 'node:crypto';
import type { Container, Newable } from 'inversify';
import { type MockInstance, vi } from 'vitest';
import type { ToolFile } from '../packages/base/src/tool-versions-types.ts';
import type { HttpChecksumType } from '../src/cli/services/http.service.ts';
import { PathService, ToolVersionsService } from '../src/cli/services/index.ts';
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

/**
 * Mocks the tool-versions files of every version of every tool.
 * @param files - the files of each version, without them there is no data, so
 * the installers use their own download
 * @returns the spy of the lookups
 */
export function mockToolFiles(
  files?: ToolFile[],
): MockInstance<ToolVersionsService['getVersionFiles']> {
  return vi
    .spyOn(ToolVersionsService.prototype, 'getVersionFiles')
    .mockImplementation((tool, version) =>
      Promise.resolve(files && { tool, version, files }),
    );
}

/**
 * A tool-versions file of `url`, named like the last url segment, with the
 * sha256 checksum of `content`.
 * @param arch - the arch of the file, by default for any arch
 */
export function toolFile(
  url: string,
  content: string,
  arch?: string,
): ToolFile {
  return {
    name: url.slice(url.lastIndexOf('/') + 1),
    url,
    checksum: `sha256:${checksum(content)}`,
    ...(arch ? { arch } : {}),
  };
}
