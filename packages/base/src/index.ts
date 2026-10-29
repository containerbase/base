import { tools } from './data.ts';
import type { DistroCode } from './types.ts';

export type {
  Arch,
  DistroCode,
  InstallToolType,
  ToolMetadata,
  ToolType,
} from './types.ts';
export type {
  FileIntegrity,
  FileReference,
  FormatIndex,
  ReleaseInfo,
  ToolFile,
  ToolIndex,
  ToolVersion,
  ToolVersions,
  VersionFiles,
  VersionIntegrity,
} from './tool-versions-types.ts';

export {
  containerbaseVersionFile,
  isCompatibleVersion,
  isContainerbase,
  packageVersion,
  toolVersionsPath,
  validateContainerbaseVersion,
} from './containerbase.ts';

export { filterByMinCb, minCbByVersion } from './min-cb.ts';
export { isReleaseVersion } from './release-version.ts';

export {
  isToolVersionsFormat,
  toolVersionsFormat,
  toolVersionsFormatPath,
} from './tool-versions-format.ts';

export type { UrlReplacement, UrlReplacements } from './url.ts';
export { getUrlReplacements, replaceUrl } from './url.ts';

export { tools };

/**
 * The Ubuntu release the default containerbase image is built from, the
 * distro `minVersion` refers to.
 */
export const defaultDistro: DistroCode = 'noble';

/**
 * A tool name `install-tool` accepts.
 */
export type ToolName = keyof typeof tools;

/**
 * All supported tool names, sorted alphabetically.
 */
export const toolNames = Object.keys(tools) as ToolName[];
