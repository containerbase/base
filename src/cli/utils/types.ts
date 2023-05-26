export interface Distro {
  readonly name: string;
  readonly versionCode: string;
  readonly versionId: string;
}

export type CliMode = 'containerbase-cli' | 'install-tool';
