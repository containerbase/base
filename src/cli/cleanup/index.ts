import { CacheService, createContainer } from '../services/index.ts';
import { logger } from '../utils/index.ts';

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
