/**
 * The installer a dynamically installed tool is installed with.
 */
export type InstallToolType = 'gem' | 'npm' | 'pip';

/**
 * The package manager installing a tool.
 */
export type ToolType = 'gem' | 'npm' | 'pip' | 'dotnet';

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
   * versioning. Tools without a known limit have none.
   */
  minVersion?: string;
}
