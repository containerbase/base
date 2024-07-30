import type { InstallToolType } from '../install-tool';

export const NoPrepareTools = [
  'bazelisk',
  'bower',
  'bun',
  'bundler',
  'checkov',
  'cocoapods',
  'composer',
  'copier',
  'corepack',
  'flux',
  'gleam',
  'gradle',
  'hashin',
  'kubectl',
  'lerna',
  'maven',
  'npm',
  'pdm',
  'pip-tools',
  'pipenv',
  'pnpm',
  'poetry',
  'renovate',
  'yarn',
  'yarn-slim',
];

/**
 * Tools in this map are implicit mapped from `install-tool` to `install-<type>`.
 * So no need for an extra install service.
 */
export const ResolverMap: Record<string, InstallToolType | undefined> = {
  bundler: 'gem',
  checkov: 'pip',
  copier: 'pip',
  corepack: 'npm',
  hashin: 'pip',
  npm: 'npm',
  pnpm: 'npm',
  pdm: 'pip',
  'pip-tools': 'pip',
  pipenv: 'pip',
  poetry: 'pip',
};

/**
 * This tools are deprecated and should not be used anymore via `install-tool`.
 * They are implicit mapped from `install-tool` to `install-<type>`.
 */
export const DeprecatedTools: Record<string, InstallToolType | undefined> = {
  bower: 'npm',
  lerna: 'npm',
};
