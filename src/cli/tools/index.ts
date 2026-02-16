import type { InstallToolType } from '../utils';

export const NoPrepareTools = [
  'apko',
  'bazelisk',
  'bower',
  'buildx',
  'bun',
  'bundler',
  'checkov',
  'cocoapods',
  'composer',
  'copier',
  'corepack',
  'deno',
  'devbox',
  'docker-compose',
  'flux',
  'git-lfs',
  'gleam',
  'gradle',
  'hashin',
  'helm',
  'helmfile',
  'jb',
  'kubectl',
  'kustomize',
  'lerna',
  'maven',
  'nix',
  'nuget',
  'npm',
  'paket',
  'pdm',
  'pip-tools',
  'pipenv',
  'pnpm',
  'pixi',
  'poetry',
  'protoc',
  'renovate',
  'scala',
  'skopeo',
  'sops',
  'terraform',
  'tofu',
  'uv',
  'vendir',
  'wally',
  'yarn',
  'yarn-slim',
];

export const NoInitTools = [
  ...NoPrepareTools,
  'erlang',
  'powershell',
  'python',
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
  uv: 'pip',
};

/**
 * This tools are deprecated and should not be used anymore via `install-tool`.
 * They are implicit mapped from `install-tool` to `install-<type>`.
 */
export const DeprecatedTools: Record<string, InstallToolType | undefined> = {
  bower: 'npm',
  lerna: 'npm',
};
