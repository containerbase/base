# Adding a prebuild tool

For maintainers. Tools without a usable upstream Linux release are built in `containerbase/<tool>-prebuild` and published as GitHub releases.
Templates: [`skopeo-prebuild`](https://github.com/containerbase/skopeo-prebuild) (per arch), [`python-prebuild`](https://github.com/containerbase/python-prebuild) (per distro and arch).

## 1. Prebuild repository

| File                          | Content                                                     |
| ----------------------------- | ----------------------------------------------------------- |
| `builder.json`                | upstream versions to build                                  |
| `Dockerfile`                  | builder image, entrypoint `builder.sh`                      |
| `bin/install-builder.sh`      | build dependencies                                          |
| `bin/builder.sh`              | builds one version into `/cache`                            |
| `.github/workflows/build.yml` | matrix over arch (and distro), runs `binary-builder`        |
| `renovate.Dockerfile`         | one `# renovate:` line per maintained upstream release line |
| `.github/renovate.json`       | `"extends": ["local>containerbase/.github"]`                |

`builder.json`, read by [`binary-builder`](https://github.com/containerbase/internal-tools/tree/main/src/commands/binary):

```json
{
  "image": "skopeo",
  "depName": "containers/skopeo",
  "datasource": "github-releases",
  "versioning": "semver",
  "startVersion": "1.14.0",
  "extractVersion": "^v(?<version>\\d+\\.\\d+\\.\\d+)$",
  "ignoredVersions": []
}
```

- `image`: tool name, names the archives
- `depName`, `datasource`, `versioning`, `extractVersion`: Renovate lookup of the upstream versions
- `startVersion`: oldest version; `ignoredVersions`: skipped versions
- optional: `forceUnstable`, `maxVersions`, `reverse`

`Dockerfile`:

- `FROM ghcr.io/containerbase/base` for toolchains via `install-tool`
- `FROM ghcr.io/containerbase/ubuntu` with `ARG DISTRO` for distro specific builds

`bin/builder.sh <version>`:

- builds and smoke tests the version
- writes `/cache/<tool>-<version>[-<distro>]-<arch>.tar.xz`, `<arch>` from `uname -p` (`x86_64`, `aarch64`)
- the archive contains the `<version>` folder:

  ```sh
  tar -cJf "/cache/${NAME}-${VERSION}-${ARCH}.tar.xz" -C "/usr/local/${NAME}" "${VERSION}"
  ```

`build.yml`:

- matrix `ARCH` (`ubuntu-24.04`, `ubuntu-24.04-arm`) and `DISTRO` if distro specific
- `containerbase/internal-tools` with `command: binary-builder`, `token`, `permissions: contents: write`
- `dry-run` on pull requests, builds the newest version only

Per version on `main`, `binary-builder`:

1. creates or updates the release, tag = version
1. skips existing archives, otherwise runs `builder.sh`
1. uploads the archive and `<archive>.sha512`
1. uploads the `version` asset (latest stable), used by the CLI for `latest`

## 2. CLI

- install service as in [Kind 2](./new-tool.md#kind-2-an-upstream-prebuilt-binary), from `https://github.com/containerbase/<tool>-prebuild/releases/download/<version>/<archive>`, verified with `<archive>.sha512`
- distro specific: extend `PrebuildInstallService` ([`src/cli/tools/utils/prebuild.ts`](../src/cli/tools/utils/prebuild.ts)), it uses the `jammy` build on newer Ubuntu
- `latest`: extend `PrebuildVersionResolver`
- test images: `# renovate: datasource=github-releases packageName=containerbase/<tool>-prebuild`; the org preset delays prebuild updates by 2h for the `aarch64` build

## 3. tool-versions

After the Containerbase release: `prebuild('<tool>', '<versioning>')` in tool-versions, see [Downstream](./new-tool.md#downstream-tool-versions-and-renovate).
