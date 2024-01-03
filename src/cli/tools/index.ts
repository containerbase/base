import type { InstallToolType } from '../install-tool';

export const NoPrepareTools = [
  'bazelisk',
  'bower',
  'bun',
  'bundler',
  'cocoapods',
  'corepack',
  'flux',
  'lerna',
  'maven',
  'node',
  'npm',
  'pnpm',
  'renovate',
  'yarn',
  'yarn-slim',
];

export const ResolverMap: Record<string, InstallToolType | undefined> = {
  corepack: 'npm',
  lerna: 'npm',
  npm: 'npm',
  pnpm: 'npm',
  renovate: 'npm',
  yarn: 'npm',
  'yarn-slim': 'npm',
};
