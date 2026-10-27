import {
  prepareInstallContainer,
  prepareUninstallContainer,
} from '../install-tool/index.ts';
import { CacheService, createContainer } from '../services/index.ts';
import { logger } from '../utils/index.ts';
import { CleanupCacheService } from './cleanup-cache.service.ts';
import { CleanupToolService } from './cleanup-tool.service.ts';

/**
 * Uninstalls all unlinked tool versions, see
 * `CleanupToolService.cleanupTools`. Generic install services are registered
 * for every installed `gem`, `npm` or `pip` package.
 *
 * @throws when the containerbase folders are not writable, except for a dry
 * run
 */
export async function cleanupTools(dryRun = false): Promise<number | void> {
  const container = await prepareUninstallContainer(dryRun);
  container.bind(CleanupToolService).toSelf();
  const svc = await container.getAsync(CleanupToolService);
  return svc.cleanupTools(dryRun);
}

/**
 * Removes the known tool caches, see `CleanupCacheService.cleanupCache`, and
 * logs how many were removed.
 *
 * @returns the removed paths, with `dryRun` the paths which would be removed
 */
export async function cleanupCache(dryRun = false): Promise<string[]> {
  const container = await prepareInstallContainer();
  container.bind(CleanupCacheService).toSelf();
  const svc = await container.getAsync(CleanupCacheService);
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
