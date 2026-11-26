/**
 * The installer a dynamically installed tool is installed with.
 */
export type InstallToolType = 'gem' | 'npm' | 'pip';

/**
 * The package manager installing a tool.
 */
export type ToolType = 'gem' | 'npm' | 'pip' | 'dotnet';

/**
 * The Ubuntu releases containerbase artifacts are built for, by codename, like
 * the distro of a tool-versions file or a prebuild archive. It keeps releases
 * which are no longer supported as host, as newer releases still use their
 * prebuilds, see {@link HostDistroCode}.
 */
export type DistroCode = 'jammy' | 'noble' | 'resolute';

/**
 * The Ubuntu releases containerbase runs on, by codename, a subset of
 * {@link DistroCode}.
 */
export type HostDistroCode = 'noble' | 'resolute';

/**
 * The CPU architectures containerbase supports.
 */
export type Arch = 'amd64' | 'arm64';

/**
 * What containerbase knows about a supported tool.
 */
export interface ToolMetadata {
  /**
   * The package manager installing the tool.
   */
  type?: ToolType;
  /**
   * The tool this tool depends on, eg. `composer` depends on `php`.
   */
  parent?: string;
  /**
   * Deprecated tools should not be used any more.
   */
  deprecated?: true;
  /**
   * The tool can only be installed as root, so only at image build time.
   */
  root?: true;
  /**
   * The oldest version containerbase supports for the tool, in the tool's
   * versioning, on the default distro (`defaultDistro`). Tools without a known
   * limit have none.
   */
  minVersion?: string;
  /**
   * The oldest version containerbase supports on an Ubuntu release, only for
   * the releases whose floor differs from `minVersion`, the floor on the
   * default distro.
   */
  distroMinVersion?: Partial<Record<HostDistroCode, string>>;
}
