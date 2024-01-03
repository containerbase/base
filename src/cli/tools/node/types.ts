export interface NodeVersionMeta {
  version: string;
  lts?: boolean;
}

export interface NpmPackageMeta {
  'dist-tags': Record<string, string>;
  name: string;
}
