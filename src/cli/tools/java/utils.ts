import type { HttpService } from '../../services';
import type { Arch } from '../../utils';
import {
  type AdoptiumPackage,
  AdoptiumReleaseVersions,
  AdoptiumReleases,
} from './schema';

export async function resolveLatestJavaLtsVersion(
  http: HttpService,
  type: 'jre' | 'jdk',
  arch: Arch,
): Promise<string> {
  const base_url = 'https://api.adoptium.net/v3/info/release_versions';
  const api_args =
    'heap_size=normal&os=linux&page=0&page_size=1&project=jdk&release_type=ga&lts=true&semver=true';

  const res = AdoptiumReleaseVersions.parse(
    await http.getJson(
      `${base_url}?architecture=${arch === 'amd64' ? 'x64' : 'aarch64'}&image_type=${type}&${api_args}`,
    ),
  );

  return res.versions[0]!.semver;
}

export async function resolveJavaDownloadUrl(
  http: HttpService,
  type: 'jre' | 'jdk',
  arch: Arch,
  version: string,
): Promise<AdoptiumPackage | undefined> {
  const base_url = 'https://api.adoptium.net/v3/assets/version';
  const api_args =
    'heap_size=normal&os=linux&page=0&page_size=1&project=jdk&semver=true';

  const res = AdoptiumReleases.parse(
    await http.getJson(
      `${base_url}/${version}?architecture=${arch === 'amd64' ? 'x64' : 'aarch64'}&image_type=${type}&${api_args}`,
    ),
  );

  return res?.[0]?.binaries?.[0]?.package;
}
