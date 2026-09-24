/**
 * The installer a dynamically installed tool is installed with.
 */
export type InstallToolType = 'gem' | 'npm' | 'pip';

/**
 * What containerbase knows about a supported tool.
 */
export interface ToolMetadata {
  /**
   * The installer used for this tool, only set for dynamically installed tools.
   */
  type?: InstallToolType;
  /**
   * The tool this tool depends on, eg. `composer` depends on `php`.
   */
  parent?: string;
  /**
   * Deprecated tools should not be used any more.
   */
  deprecated?: true;
}
