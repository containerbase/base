import { z } from 'zod';

const NodeVersionMeta = z.object({
  version: z.string(),
  lts: z.union([z.string(), z.boolean()]).optional(),
});
export type NodeVersionMeta = z.infer<typeof NodeVersionMeta>;

export const NpmPackageMetaList = z.array(NodeVersionMeta);

export const NpmPackageMeta = z.object({
  'dist-tags': z.record(z.string(), z.string()),
  name: z.string(),
  // the abbreviated document lists all versions as keys, deprecated ones carry a message,
  // the entries are not validated so an odd one can't break the whole document
  versions: z.record(z.string(), z.unknown()).default({}),
});

export type NpmPackageMeta = z.infer<typeof NpmPackageMeta>;
