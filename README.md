# containerbase base

![Build status](https://github.com/containerbase/base/actions/workflows/build-push.yml/badge.svg)
![Docker Image Size (latest)](https://img.shields.io/docker/image-size/containerbase/base/latest)
![GitHub release (latest SemVer)](https://img.shields.io/github/v/release/containerbase/base)
![Licence: MIT](https://img.shields.io/github/license/containerbase/base)

This repository is the source for the Docker images [`containerbase/base`](https://hub.docker.com/r/containerbase/base) and `ghcr.io/containerbase/base`.
It is not associated with or compatible with the `buildpacks.io` project.
Commits to `main` branch are automatically build and published.

## Local development

You need a recent [docker](https://www.docker.com) version with [buildx](https://github.com/docker/buildx) [`>= v0.4.0`](https://github.com/docker/buildx/releases/tag/v0.4.0) plugin installed.

You first need to build the cli before building the docker images.

```console
> yarn install
> yarn build
```

### Base image

If you make changes to the [`src`](./src/) folder or the [`Dockerfile`](./Dockerfile), you need to rebuild the `containerbase/base` image.

```sh
docker buildx bake
```

You can use the following command to ignore remote cache for local testing.
This will probably speedup local builds.

```sh
docker buildx bake  --set *.cache-from=
```

### Test images

To run one of the tests use the following command, it will run the java tests from [`test/java`](./test/java/).

```sh
TAG=java docker buildx bake test
```

For other test images checkout [`test`](./test/) folder.

### Distro test images

To run the jammy tests use the following command, it will run the test from [`test/Dockerfile.jammy`](./test/Dockerfile.jammy).

```sh
TAG=jammy docker buildx bake test-distro
```

## Apt proxy

You can configure an Apt proxy for the build by specifying an `APT_HTTP_PROXY` argument.

Example: `docker build --build-arg APT_HTTP_PROXY=https://apt.company.com . -t my/image`

You can simply export `APT_HTTP_PROXY` to your local env and our build tools will use your apt proxy for `http` sources.

## Custom base image

To use a custom base image with `containerbase/base` checkout [custom-base-image](./docs/custom-base-image.md) docs.

### Custom Root CA Certificates

To add custom root certificates to the `containerbase/base` base image checkout [custom-root-ca](./docs/custom-root-ca.md) docs.

### Temporary disable tool installer

To temporary disable / skip some tool installer set the build arg `IGNORED_TOOLS` to a comma separated case-insensitive tool names list.

The following sample will skip the installation of `powershell` and `node`.

```Dockerfile
FROM containerbase/base

ARG IGNORED_TOOLS=powershell,node


# renovate: datasource=github-releases packageName=PowerShell/PowerShell
RUN install-tool powershell v7.1.3

# renovate: datasource=docker versioning=docker
RUN install-tool node 14.17.3

# renovate: datasource=github-releases packageName=moby/moby
RUN install-tool docker 20.10.7
```

### Url replacement

You can replace the default urls used to download the tools.
This is currently only supported by the `docker` tool installer.
Checkout #1067 for additional support.

```Dockerfile
FROM containerbase/base

ENV URL_REPLACE_0_FROM=https://download.docker.com/linux/static/stable
ENV URL_REPLACE_0_TO=https://artifactory.proxy.test/some/virtual/patch/docker

# renovate: datasource=github-releases packageName=moby/moby
RUN install-tool docker v24.0.2
```
