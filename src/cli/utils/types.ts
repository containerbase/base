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
] as const;

export type CliMode = (typeof cliModes)[number];

export type Arch = 'arm64' | 'amd64';

export type ClazzDecorator<T> = <V extends T = T>(target: V) => V | void;
