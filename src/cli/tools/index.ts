import type { InstallToolType } from '../utils';

export const NoPrepareTools = [
  'android-sdk-cmdline-tools',
  'apko',
  'apm',
  'bazelisk',
  'buf',
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
  'gh',
  'git-lfs',
  'gleam',
  'gradle',
  'hashin',
  'helm',
  'helmfile',
  'jb',
  'jq',
  'kubectl',
  'kustomize',
  'maven',
  'mise',
  'nix',
  'nub',
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
  'vp',
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
export const ResolverMap: Record<string, InstallToolType> = {
  bundler: 'gem',
  checkov: 'pip',
  copier: 'pip',
  corepack: 'npm',
  hashin: 'pip',
  kas: 'pip',
  npm: 'npm',
  pnpm: 'npm',
  pdm: 'pip',
  'pip-tools': 'pip',
  pipenv: 'pip',
  poetry: 'pip',
  uv: 'pip',
};

/**
 * Looks up the install type of a tool in the given map.
 * Only own keys resolve, so names like `constructor` never match.
 * @param map - tool to install type map
 * @param name - tool name
 * @returns the mapped install type or `undefined`
 */
export function getToolType(
  map: Record<string, InstallToolType>,
  name: string,
): InstallToolType | undefined {
  return Object.hasOwn(map, name) ? map[name] : undefined;
}
