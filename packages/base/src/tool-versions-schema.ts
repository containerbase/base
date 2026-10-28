import { z } from 'zod';
import { ToolType } from './schema.ts';

// Reader schemas of the published tool-versions format, see
// https://github.com/containerbase/tool-versions/blob/main/docs/format.md
//
// Keep in sync with the interfaces in `tool-versions-types.ts`, which are the
// zod free version used by the default export. The objects are plain
// `z.object`s, so unknown keys are dropped and additive changes of the format
// don't break readers. Optionals are exact, so the inferred types match the
// interfaces.

/** A file of a version: where to download it and how to verify it. */
export const ToolFile = z.object({
  /** the file name */
  name: z.string().min(1),
  /** the https download url */
  url: z.url({ protocol: /^https$/ }),
  /**
   * `<algorithm>:<lowercase hex>`, published with `sha1`, `sha256` or
   * `sha512`. The digests of the sha algorithms readers verify (`sha1`,
   * `sha224`, `sha256`, `sha384`, `sha512`) must have their exact length.
   * Lenient for other algorithms, so a new one doesn't reject the whole file:
   * readers skip a file with an algorithm they don't know.
   */
  checksum: z
    .string()
    .regex(
      /^(?:sha1:[0-9a-f]{40}|sha224:[0-9a-f]{56}|sha256:[0-9a-f]{64}|sha384:[0-9a-f]{96}|sha512:[0-9a-f]{128}|(?!sha(?:1|224|256|384|512):)[a-z0-9-]+:[0-9a-f]+)$/,
    ),
  /**
   * the containerbase arch, like `amd64`, omitted for arch-independent files;
   * readers ignore files of an arch they don't know
   */
  arch: z.string().min(1).exactOptional(),
  /** the distro of a distro specific file, like `jammy` */
  distro: z.string().min(1).exactOptional(),
});

/**
 * An SRI-style sha256 digest of a published file's bytes, like npm's
 * `integrity`.
 */
export const FileIntegrity = z.string().regex(/^sha256-[0-9A-Za-z+/]{43}=$/);

/**
 * A version `install-tool` can install, the flags are only set when true and
 * `files` and `releaseTimestamp` only when known.
 */
export const ToolVersion = z.object({
  version: z.string().min(1),
  prerelease: z.literal(true).exactOptional(),
  lts: z.literal(true).exactOptional(),
  /** the registry deprecates the version, only for npm tools */
  deprecated: z.literal(true).exactOptional(),
  /** when the version was released, in UTC */
  releaseTimestamp: z.iso.datetime().exactOptional(),
  /**
   * sorted by name, not in the `<tool>.json` files, but in the
   * `<tool>/<version>.json` ones
   */
  files: z.array(ToolFile).min(1).exactOptional(),
  /**
   * the runtime constraint of this version per parent tool, like
   * `{ node: '>=20.17.0' }`, as the raw string in the registry's syntax, only
   * present when the registry has one
   */
  constraints: z.record(z.string().min(1), z.string().min(1)).exactOptional(),
  /**
   * sorted, the archs which have a file of this version, only in the
   * `<tool>.json` files and only for versions with arch specific files
   */
  archs: z.array(z.string().min(1)).min(1).exactOptional(),
  /**
   * sorted, the distro codenames which have a file of this version, only in
   * the `<tool>.json` files and only for versions with distro specific files
   */
  distros: z.array(z.string().min(1)).min(1).exactOptional(),
});

/**
 * The url of the json schema of a published file, which identifies its format.
 * It is the first property, optional so files published before it was added
 * still parse.
 */
const SchemaUrl = z.url({ protocol: /^https$/ }).exactOptional();

/** The content of a `<tool>.json` file. */
export const ToolVersions = z.object({
  $schema: SchemaUrl,
  tool: z.string(),
  /** the package manager installing the tool, omitted for other tools */
  type: ToolType.exactOptional(),
  /** where the source code of the tool lives, omitted when unset */
  sourceUrl: z.url({ protocol: /^https$/ }).exactOptional(),
  /** the homepage of the tool, omitted when unset */
  homepage: z.url({ protocol: /^https$/ }).exactOptional(),
  /** the tool has LTS release streams, like `node` and `java` */
  lts: z.literal(true).exactOptional(),
  /**
   * the version of the npm `latest` dist-tag, only for npm tools and only when
   * it is listed in `versions`
   */
  latest: z.string().min(1).exactOptional(),
  /**
   * the oldest version containerbase supports, on the `defaultDistro` of the
   * root index, in the versioning of the tool. Older versions aren't listed.
   * Omitted for tools without a limit.
   */
  minVersion: z.string().min(1).exactOptional(),
  /**
   * the oldest version on a distro, by codename, only for the distros whose
   * floor differs from `minVersion`. Any codename is allowed, so new distros
   * don't break readers.
   */
  distroMinVersion: z
    .record(z.string().min(1), z.string().min(1))
    .exactOptional(),
  /**
   * the oldest containerbase version, like `14.51.0`, which can install a
   * version. A range applies to its `version` and every version above it in
   * `versions`. Omitted for tools without a limit. Lenient, so a slip of the
   * writer doesn't reject the file: a `cb` which isn't valid semver is never
   * met by a reader.
   */
  minCb: z
    .array(
      z.object({
        /** the version where the range starts, a version of `versions` */
        version: z.string().min(1),
        /** the oldest containerbase version, in semver */
        cb: z.string(),
      }),
    )
    .exactOptional(),
  updatedAt: z.iso.datetime(),
  /** newest first */
  versions: z.array(ToolVersion),
});

/** The content of a `<tool>/<version>.json` file: the files of one version. */
export const VersionFiles = z.object({
  $schema: SchemaUrl,
  tool: z.string(),
  version: z.string().min(1),
  /** sorted by name */
  files: z.array(ToolFile).min(1),
});

/**
 * The content of a `<tool>.integrity.json` file: the integrity of each
 * `<tool>/<version>.json` file, by version.
 */
export const VersionIntegrity = z.object({
  $schema: SchemaUrl,
  tool: z.string(),
  versions: z.record(z.string(), FileIntegrity),
});

/** A published file and the integrity of its bytes. */
export const FileReference = z.object({
  file: z.string(),
  integrity: FileIntegrity,
});

/** The content of the `v1/index.json` file. */
export const ToolIndex = z.object({
  $schema: SchemaUrl,
  updatedAt: z.iso.datetime(),
  tools: z.array(
    z.object({
      tool: z.string(),
      versionCount: z.number().int().nonnegative(),
      /** the `<tool>.json` file, the versions without their files */
      slim: FileReference,
      /**
       * the `<tool>.integrity.json` file, with the integrity of each
       * `<tool>/<version>.json` file, only for tools with files
       */
      versionFiles: FileReference.exactOptional(),
    }),
  ),
});

/**
 * The content of the root `index.json` file, which lists the published formats.
 * It is minimal and stable: consumers pin a major version of the format and
 * only read it to warn when their major is deprecated.
 */
export const FormatIndex = z.object({
  $schema: SchemaUrl,
  /**
   * the codename of the Ubuntu release the default image is built from, which
   * the `minVersion` of the tools refers to
   */
  defaultDistro: z.string().min(1),
  formats: z.array(
    z.object({
      /** the major version of the format */
      version: z.number().int().positive(),
      /** the folder of the format, relative to the root */
      path: z.string().min(1),
      /** `current` is the format to use, `preview` is not stable yet */
      status: z.enum(['current', 'preview', 'deprecated']),
      /** the date a deprecated format is no longer published */
      removalDate: z.iso.date().exactOptional(),
    }),
  ),
});
