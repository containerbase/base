export interface Distro {
  readonly name: string;
  readonly versionCode: string;
  readonly versionId: string;
}

export const cliModes = [
  'containerbase-cli',
  'install-gem',
  'install-npm',
  'install-pip',
  'install-tool',
  'prepare-tool',
  'uninstall-gem',
  'uninstall-npm',
  'uninstall-pip',
  'uninstall-tool',
] as const;

export type CliMode = (typeof cliModes)[number];

export type Arch = 'arm64' | 'amd64';

/** The Ubuntu releases containerbase supports. */
export type DistroCode = 'jammy' | 'noble' | 'resolute';

export const installToolTypes = ['gem', 'npm', 'pip'] as const;

export type InstallToolType = (typeof installToolTypes)[number];

/**
 * The package manager installing a tool, published as `type` in the base
 * package metadata. Unlike `InstallToolType` it also covers package managers
 * without an `install-<type>` command.
 */
export type ToolType = InstallToolType | 'dotnet';
