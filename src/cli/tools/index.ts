import type { InstallToolType } from '../install-tool';

export const NoPrepareTools = [
  'bazelisk',
  'bower',
  'bun',
  'bundler',
  'cocoapods',
  'corepack',
  'flux',
  'gleam',
  'lerna',
  'maven',
  'node',
  'npm',
  'pnpm',
  'renovate',
  'wally',
  'yarn',
  'yarn-slim',
];

/**
 * Tools in this map are implicit mapped from `install-tool` to `install-<type>`.
 * So no need for an extra install service.
 */
export const ResolverMap: Record<string, InstallToolType | undefined> = {
  bundler: 'gem',
  corepack: 'npm',
  npm: 'npm',
  pnpm: 'npm',
  yarn: 'npm',
};

/**
 * This tools are deprecated and should not be used anymore via `install-tool`.
 * They are implicit mapped from `install-tool` to `install-<type>`.
 */
export const DeprecatedTools: Record<string, InstallToolType | undefined> = {
  bower: 'npm',
  lerna: 'npm',
};
