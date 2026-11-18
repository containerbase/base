import type { InstallToolType } from '../utils';

export const NoPrepareTools = [
  'android-sdk-cmdline-tools',
  'apko',
  'apm',
  'aube',
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

/** The type prefix of a recorded package name, see {@link packageKey}. */
const typePrefix = /^(?:gem|npm|pip)\+/;

/**
 * The name a package installed with `install-gem`, `install-npm` or
 * `install-pip` is recorded and installed under: its type and name, eg.
 * `npm+yarn`, so it never matches a tool of the same name. `+` is safe in
 * folder names and the `PATH`.
 * @param type - the install type of the package
 * @param name - the package name
 */
export function packageKey(type: InstallToolType, name: string): string {
  return `${type}+${name}`;
}

/**
 * The package name of a recorded name: the name without its type prefix, see
 * {@link packageKey}, else the name itself, eg. for a tool of the
 * {@link ResolverMap}.
 */
export function packageName(name: string): string {
  return name.replace(typePrefix, '');
}

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
