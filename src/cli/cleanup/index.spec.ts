import { describe, expect, test, vi } from 'vitest';
import { CacheService } from '../services/index.ts';
import { logger } from '../utils/index.ts';
import { cleanupDownloads } from './index.ts';

describe('cli/cleanup/index', () => {
  describe('cleanupDownloads', () => {
    test('evicts the download cache', async () => {
      const spy = vi
        .spyOn(CacheService.prototype, 'evict')
        .mockResolvedValue(['/cache/a']);

      expect(await cleanupDownloads(true)).toEqual(['/cache/a']);
      expect(spy).toHaveBeenCalledExactlyOnceWith(true);
      // the dry run file is logged by `evict` already
      expect(logger.info).not.toHaveBeenCalled();

      expect(await cleanupDownloads()).toEqual(['/cache/a']);
      expect(logger.info).toHaveBeenCalledExactlyOnceWith(
        'Removed 1 downloads',
      );
    });

    test('logs when there is nothing to evict', async () => {
      vi.spyOn(CacheService.prototype, 'evict').mockResolvedValue([]);

      expect(await cleanupDownloads()).toEqual([]);
      expect(logger.info).toHaveBeenCalledExactlyOnceWith('Nothing to evict');
    });
  });
});
