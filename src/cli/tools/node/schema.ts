import { z } from 'zod';

const NodeVersionMeta = z.object({
  version: z.string(),
  lts: z.union([z.string(), z.boolean()]).optional(),
});
export type NodeVersionMeta = z.infer<typeof NodeVersionMeta>;

export const NpmPackageMetaList = z.array(NodeVersionMeta);

export const NpmPackageMeta = z.object({
  'dist-tags': z.record(z.string()),
  name: z.string(),
});

export type NpmPackageMeta = z.infer<typeof NpmPackageMeta>;
