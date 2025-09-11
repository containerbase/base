import { join, sep } from 'node:path';
import { Container } from 'inversify';
import { createContainer, rootContainerModule } from '../src/cli/services';

export function cachePath(path: string): string {
  return `${globalThis.cacheDir}/${path}`.replace(/\/+/g, sep);
}

export function rootPath(path?: string): string {
  if (!path) {
    return globalThis.rootDir!.replace(/\/+/g, sep);
  }
  return join(globalThis.rootDir!, path).replace(/\/+/g, sep);
}

export async function testContainer() {
  const parent = new Container();
  await parent.load(rootContainerModule);
  return createContainer(parent);
}
