# Adding a prebuild tool

> [!NOTE]
> Adding a new prebuild tool requires a maintainer's support, as this requires creating and bootstrapping a new repository.

Tools without a usable upstream Linux release are built in `containerbase/<tool>-prebuild` and published as GitHub releases.
A usable upstream Linux release is a prebuilt binary or archive for `x86_64` and `aarch64`, which runs on all supported Ubuntu versions without building or extra system packages.

If a project does have a usable upstream Linux release, you can follow ["Adding a new tool"](./new-tool.md).

Repositories to follow the structure from:

- [`skopeo-prebuild`](https://github.com/containerbase/skopeo-prebuild) (builds artifacts per arch)
- [`python-prebuild`](https://github.com/containerbase/python-prebuild) (builds artifacts per distro and arch)

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

- `image`: tool name, names the archives. Should match the repo name, i.e. `skopeo-prebuild` would have `image: skopeo`
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

- matrix `arch` entries with the archive `name` (`x86_64`, `aarch64`) and the runner `os` (`ubuntu-24.04`, `ubuntu-24.04-arm`), plus `distro` if distro specific
- `runs-on: ${{ matrix.arch.os }}`, env `ARCH: ${{ matrix.arch.name }}` and `DISTRO: ${{ matrix.distro }}`, the names `binary-builder` reads
- `containerbase/internal-tools` with `command: binary-builder`, `token`, `permissions: contents: write`
- `dry-run` on pull requests, builds the newest version only

Per version on `main`, `binary-builder`:

1. creates or updates the release, tag = version
1. skips existing archives, otherwise runs `builder.sh`
1. uploads the archive and `<archive>.sha512`
1. uploads the `version` asset (latest stable), used by the CLI for `latest`

## 2. CLI

- install service as in [Kind 2](./new-tool.md#kind-2-an-upstream-prebuilt-binary), from `https://github.com/containerbase/<tool>-prebuild/releases/download/<version>/<archive>`, verified with `<archive>.sha512`
- distro specific: extend `PrebuildInstallService` ([`src/cli/tools/utils/prebuild.ts`](../src/cli/tools/utils/prebuild.ts)), it uses the `jammy` build on every supported Ubuntu release
- `latest`: extend `PrebuildVersionResolver`
- test images: `# renovate: datasource=github-releases packageName=containerbase/<tool>-prebuild`; the org preset delays prebuild updates by 2h for the `aarch64` build

## 3. tool-versions

After the Containerbase release: `prebuild('<tool>', '<versioning>')` in [`src/tools.ts`](https://github.com/containerbase/tool-versions/blob/main/src/tools.ts) of [containerbase/tool-versions](https://github.com/containerbase/tool-versions).
