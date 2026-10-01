import { type Container, injectFromHierarchy, injectable } from 'inversify';
import { beforeEach, describe, expect, test } from 'vitest';
import { createContainer } from '../services/index.ts';
import { ToolVersionResolverService } from './tool-version-resolver.service.ts';
import {
  TOOL_VERSION_RESOLVER,
  ToolVersionResolver,
} from './tool-version-resolver.ts';

@injectable()
@injectFromHierarchy()
class DummyVersionResolver extends ToolVersionResolver {
  readonly tool = 'dummy';

  /** Resolves `latest` to `1.2.3`. */
  resolve(version: string | undefined): Promise<string | undefined> {
    return Promise.resolve(version === 'latest' ? '1.2.3' : version);
  }
}

describe('cli/install-tool/tool-version-resolver.service', () => {
  let child!: Container;
  let svc!: ToolVersionResolverService;

  beforeEach(async () => {
    child = createContainer();
    child.bind(ToolVersionResolverService).toSelf();
    child.bind(TOOL_VERSION_RESOLVER).to(DummyVersionResolver);
    svc = await child.getAsync(ToolVersionResolverService);
  });

  test('resolves with the matching resolver', async () => {
    expect(await svc.resolve('dummy', 'latest')).toBe('1.2.3');
    expect(await svc.resolve('dummy', '1.0.0')).toBe('1.0.0');
  });

  test('falls back to the given version', async () => {
    // no resolver for this tool
    expect(await svc.resolve('other', '1.0.0')).toBe('1.0.0');
    // the resolver returned nothing
    expect(await svc.resolve('dummy', undefined)).toBeUndefined();
  });
});
