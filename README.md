# containerbase base

![Build status](https://github.com/containerbase/base/actions/workflows/build-push.yml/badge.svg)
![Docker Image Size (latest)](https://img.shields.io/docker/image-size/containerbase/base/latest)
![GitHub release (latest SemVer)](https://img.shields.io/github/v/release/containerbase/base)
![Licence: MIT](https://img.shields.io/github/license/containerbase/base)
[![codecov](https://codecov.io/gh/containerbase/base/branch/main/graph/badge.svg?token=GYS2ZZAXDP)](https://codecov.io/gh/containerbase/base)

This repository is the source for the Docker images [`containerbase/base`](https://hub.docker.com/r/containerbase/base) and `ghcr.io/containerbase/base`.
The commits to the `main` branch are automatically built and published.

## Local development

Install a recent version of:

- [Docker](https://www.docker.com)
- the [`buildx`](https://github.com/docker/buildx) plugin

You must first build the CLI, before you build the Docker images.

```console
> pnpm install
> pnpm build
```

### Base image

If you make changes to the [`src`](./src/) folder or the [`Dockerfile`](./Dockerfile), you must:

1. run `pnpm build`
1. rebuild the `containerbase/base` image

```sh
docker buildx bake
```

You can use the following command to ignore the remote cache for local testing.
This may speed up your local builds.

```sh
docker buildx bake  --set *.cache-from=
```

### Test images

To run one of the tests use the following command, it will run the Java tests from [`test/java`](./test/java/).

```sh
TAG=java docker buildx bake test
```

For other test images see the [`test`](./test/) folder.

### Distro test images

To run the `jammy` tests use the following command, it will run the test from [`test/Dockerfile.jammy`](./test/Dockerfile.jammy).

```sh
TAG=jammy docker buildx bake test-distro
```

## Apt proxy

You can configure an apt proxy for the build by setting an `APT_HTTP_PROXY` argument.
For example: `docker build --build-arg APT_HTTP_PROXY=https://apt.company.com . -t my/image`

You can export `APT_HTTP_PROXY` to your local env and our build tools will use your apt proxy for the `http` sources.

## Custom base image

To use a custom base image with `containerbase/base` read the [custom-base-image](./docs/custom-base-image.md) docs.

### Custom Root CA Certificates

To add custom root certificates to the `containerbase/base` base image read the [custom-root-ca](./docs/custom-root-ca.md) docs.

### Temporary disable tool installer

To temporarily disable or skip some tool installer: set the build arg `IGNORED_TOOLS` to a comma separated case-insensitive tool names list.

For example, the following `Dockerfile` skips the installation of `powershell` and `node`:

```Dockerfile
FROM containerbase/base

ARG IGNORED_TOOLS=powershell,node


# renovate: datasource=github-releases packageName=PowerShell/PowerShell
RUN install-tool powershell v7.1.3

# renovate: datasource=docker versioning=docker
RUN install-tool node 20.9.0

# renovate: datasource=github-releases packageName=moby/moby
RUN install-tool docker 20.10.7
```

### Custom registries

You can replace the default registries used to download the tools.
Read the [custom-registries](./docs/custom-registries.md) docs for more details.

### Logging

The new CLI has some new logging features.
You can change the default `info` log level by setting the `CONTAINERBASE_LOG_LEVEL`[^1] environment variable.
If `CONTAINERBASE_DEBUG` is set to `true` the CLI will automatically set the log level to `debug`, if not explicit set.

You can also log to a `.ndjson` file via `CONTAINERBASE_LOG_FILE` and `CONTAINERBASE_LOG_FILE_LEVEL` environment variables.
The default value for `CONTAINERBASE_LOG_FILE_LEVEL` is `debug`.

[^1]: <https://getpino.io/#/docs/api?id=level-string>
