import type { Container } from 'inversify';
import {
  prepareInstallContainer,
  prepareUninstallContainer,
} from '../install-tool/index.ts';
import { CacheService, createContainer } from '../services/index.ts';
import { logger } from '../utils/index.ts';
import { CleanupCacheService } from './cleanup-cache.service.ts';
import { CleanupToolService } from './cleanup-tool.service.ts';

/** Binds the cleanup services to an install container. */
function bindCleanupServices(container: Container): Container {
  container.bind(CleanupCacheService).toSelf();
  container.bind(CleanupToolService).toSelf();
  return container;
}

/**
 * Uninstalls all unlinked tool versions, see
 * `CleanupToolService.cleanupTools`. Generic install services are registered
 * for every installed `gem`, `npm` or `pip` package.
 *
 * @param container a container from `prepareUninstallContainer` with the
 * cleanup services to reuse, else a new one is created
 * @throws when the containerbase folders are not writable, except for a dry
 * run
 */
export async function cleanupTools(
  dryRun = false,
  container?: Container,
): Promise<number | void> {
  const svc = await (
    container ?? bindCleanupServices(await prepareUninstallContainer(dryRun))
  ).getAsync(CleanupToolService);
  return svc.cleanupTools(dryRun);
}

/**
 * Removes the known tool caches, see `CleanupCacheService.cleanupCache`, and
 * logs how many were removed.
 *
 * @param container an install container with the cleanup services to reuse,
 * else a new one is created
 * @returns the removed paths, with `dryRun` the paths which would be removed
 */
export async function cleanupCache(
  dryRun = false,
  container?: Container,
): Promise<string[]> {
  const svc = await (
    container ?? bindCleanupServices(await prepareInstallContainer())
  ).getAsync(CleanupCacheService);
  const removed = await svc.cleanupCache(dryRun);
  logger.info(
    dryRun
      ? `Dry run: would remove ${removed.length} cache paths`
      : `Removed ${removed.length} cache paths`,
  );
  return removed;
}

/**
 * Evicts the oldest files from the download cache, see `CacheService.evict`,
 * and logs how many were removed.
 *
 * @returns the removed files, with `dryRun` the file which would be removed
 * first
 */
export async function cleanupDownloads(dryRun = false): Promise<string[]> {
  const svc = await createContainer().getAsync(CacheService);
  const removed = await svc.evict(dryRun);
  if (!removed.length) {
    logger.info('Nothing to evict');
  } else if (!dryRun) {
    // a dry run only returns the oldest file, which `evict` already logs
    logger.info(`Removed ${removed.length} downloads`);
  }
  return removed;
}

/**
 * Runs all cleanups in order: the unlinked tools, the tool caches and the
 * download cache, see `cleanupTools`, `cleanupCache` and `cleanupDownloads`.
 * A failing step is logged and the next one still runs. The tool and cache
 * cleanups share one install container, created before any step runs.
 *
 * @returns the exit code of the first failed step, `1` when it threw, else `0`
 * @throws when the install container can't be created, eg. because the
 * containerbase folders are not writable, then no step runs
 */
export async function cleanupAll(dryRun = false): Promise<number> {
  const container = bindCleanupServices(
    await prepareUninstallContainer(dryRun),
  );
  const steps: [string, () => Promise<unknown>][] = [
    ['tool', () => cleanupTools(dryRun, container)],
    ['cache', () => cleanupCache(dryRun, container)],
    ['downloads', () => cleanupDownloads(dryRun)],
  ];
  let code = 0;
  for (const [name, step] of steps) {
    logger.info(`Cleanup ${name} ...`);
    let res: unknown;
    try {
      res = await step();
    } catch (err) {
      logger.warn({ err }, `Cleanup ${name} failed`);
      code ||= 1;
      continue;
    }
    if (typeof res === 'number' && res) {
      logger.warn({ code: res }, `Cleanup ${name} failed`);
      code ||= res;
    }
  }
  return code;
}
