import type { ToolType } from './types.ts';

// Zod free types of the published tool-versions format, see
// https://github.com/containerbase/tool-versions/blob/main/docs/format.md
//
// Keep in sync with the schemas in `tool-versions-schema.ts`.

/**
 * A file of a version: where to download it and how to verify it.
 */
export interface ToolFile {
  /**
   * The file name.
   */
  name: string;
  /**
   * The https download url.
   */
  url: string;
  /**
   * `<algorithm>:<lowercase hex>`
   */
  checksum: string;
  /**
   * The containerbase arch, like `amd64`, omitted for arch-independent files;
   * readers ignore files of an arch they don't know.
   */
  arch?: string;
  /**
   * The distro of a distro specific file, like `jammy`.
   */
  distro?: string;
}

/**
 * An SRI-style sha256 digest of a published file's bytes, like npm's
 * `integrity`.
 */
export type FileIntegrity = string;

/**
 * A version `install-tool` can install, the flags are only set when true and
 * `files` and `releaseTimestamp` only when known.
 */
export interface ToolVersion {
  version: string;
  prerelease?: true;
  lts?: true;
  /**
   * When the version was released, in UTC.
   */
  releaseTimestamp?: string;
  /**
   * Sorted by name, not in the `<tool>.json` files, but in the
   * `<tool>/<version>.json` ones.
   */
  files?: ToolFile[];
  /**
   * The runtime constraint of this version per parent tool, like
   * `{ node: '>=20.17.0' }`, as the raw string in the registry's syntax, only
   * present when the registry has one.
   */
  constraints?: Record<string, string>;
}

/**
 * The content of a `<tool>.json` file.
 */
export interface ToolVersions {
  /**
   * The url of the json schema of the file, which identifies its format.
   */
  $schema?: string;
  tool: string;
  /**
   * The package manager installing the tool, omitted for other tools.
   */
  type?: ToolType;
  /**
   * Where the source code of the tool lives, omitted when unset.
   */
  sourceUrl?: string;
  /**
   * The homepage of the tool, omitted when unset.
   */
  homepage?: string;
  /**
   * The oldest version containerbase supports, on the `defaultDistro` of the
   * root index, in the versioning of the tool. Older versions aren't listed.
   * Omitted for tools without a limit.
   */
  minVersion?: string;
  /**
   * The oldest version on a distro, by codename, only for the distros whose
   * floor differs from `minVersion`. Any codename is allowed, so new distros
   * don't break readers.
   */
  distroMinVersion?: Record<string, string>;
  updatedAt: string;
  /**
   * Newest first.
   */
  versions: ToolVersion[];
}

/**
 * The content of a `<tool>/<version>.json` file: the files of one version.
 */
export interface VersionFiles {
  /**
   * The url of the json schema of the file, which identifies its format.
   */
  $schema?: string;
  tool: string;
  version: string;
  /**
   * Sorted by name.
   */
  files: ToolFile[];
}

/**
 * The content of a `<tool>.integrity.json` file: the integrity of each
 * `<tool>/<version>.json` file, by version.
 */
export interface VersionIntegrity {
  /**
   * The url of the json schema of the file, which identifies its format.
   */
  $schema?: string;
  tool: string;
  versions: Record<string, FileIntegrity>;
}

/**
 * A published file and the integrity of its bytes.
 */
export interface FileReference {
  file: string;
  integrity: FileIntegrity;
}

/**
 * The content of the `v1/index.json` file.
 */
export interface ToolIndex {
  /**
   * The url of the json schema of the file, which identifies its format.
   */
  $schema?: string;
  updatedAt: string;
  tools: {
    tool: string;
    versionCount: number;
    /**
     * The `<tool>.json` file, the versions without their files.
     */
    slim: FileReference;
    /**
     * The `<tool>.integrity.json` file, with the integrity of each
     * `<tool>/<version>.json` file, only for tools with files.
     */
    versionFiles?: FileReference;
  }[];
}

/**
 * The content of the root `index.json` file, which lists the published formats.
 * It is minimal and stable: consumers pin a major version of the format and
 * only read it to warn when their major is deprecated.
 */
export interface FormatIndex {
  /**
   * The url of the json schema of the file, which identifies its format.
   */
  $schema?: string;
  /**
   * The codename of the Ubuntu release the default image is built from, which
   * the `minVersion` of the tools refers to.
   */
  defaultDistro: string;
  formats: {
    /**
     * The major version of the format.
     */
    version: number;
    /**
     * The folder of the format, relative to the root.
     */
    path: string;
    /**
     * `current` is the format to use, `preview` is not stable yet.
     */
    status: 'current' | 'preview' | 'deprecated';
    /**
     * The date a deprecated format is no longer published.
     */
    removalDate?: string;
  }[];
}
