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

Node.js and pnpm are pinned in [`mise.toml`](./mise.toml), so [`mise`](https://mise.jdx.dev) users can install them with:

```console
> mise install
```

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
pnpm build
docker buildx bake
```

You can use the following command to ignore the remote cache for local testing.
This may speed up your local builds.

```sh
docker buildx bake  --set *.cache-from=
```

### Test images

Run the test images with the `test:docker` script, which wraps the `docker buildx bake` calls.
The tool tests live in the [`test`](./test/) folder, the distro tests in [`test/Dockerfile.distro`](./test/Dockerfile.distro) and [`test/Dockerfile.base`](./test/Dockerfile.base).

```sh
# run all tests from the `test` folder
pnpm test:docker

# rebuild the CLI and run the x86_64 test from `test/java`
pnpm test:docker -b -t test-x86_64 java

# run multiple tests with debug logging
pnpm test:docker -D java node

# rebuild the CLI and run the distro tests from `test/Dockerfile.distro` on jammy, noble and resolute
pnpm test:docker -b -t test-distro

# run the base test from `test/Dockerfile.base` on noble only
pnpm test:docker -t test-base noble
```

Any positional argument is the name of a folder in [`test`](./test/) which contains a `Dockerfile`.
If no test is given, all tests from the [`test`](./test/) folder are run.
Unknown test names are only reported as an error when they are passed explicitly.

With the `test-distro` or `test-base` target, the positional arguments are distro names instead: `jammy`, `noble` or `resolute`.
If no distro is given, all three are run, like in CI.
Ubuntu `jammy` is deprecated and will be removed in the next major release.

The following options are supported:

| Option                      | Description                                                                                                                             |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `-b`, `--build`             | Run `pnpm build` to compile the CLI sources before building the images.                                                                 |
| `-t`, `--target <name>`     | The bake target or group to build, defaults to `default`. Use e.g. `test`, `test-x86_64`, `test-aarch64`, `test-distro` or `test-base`. |
| `-d`, `--dry-run`           | Reserved for a dry run, currently without effect.                                                                                       |
| `-D`, `--debug`             | Set `CONTAINERBASE_DEBUG=1` and use plain buildkit progress output.                                                                     |
| `-l`, `--log-level <level>` | Set `CONTAINERBASE_LOG_LEVEL` and use plain buildkit progress output.                                                                   |
| `-p`, `--plain`             | Use plain buildkit progress output.                                                                                                     |
| `--network <mode>`          | Docker network mode used for the build, allowed values are `default`, `host` and `none`.                                                |
| `--allow-host-network`      | Pass `--allow=network.host` to `docker buildx bake`, required to use `--network host`.                                                  |
| `--host-gateway <value>`    | Value used for the `host.docker.internal` host alias, defaults to `host-gateway`.                                                       |

To build against a service running on your host or when having DNS issues from a VPN, use the host network:

```sh
pnpm test:docker --network host --allow-host-network -t test-x86_64 java
```

## Adding a new tool

To add support for a new tool read the [new-tool](./docs/new-tool.md) docs.

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

# renovate: datasource=github-releases packageName=containerbase/node-prebuild versioning=node
RUN install-tool node 20.9.0

# renovate: datasource=github-releases packageName=moby/moby
RUN install-tool docker 20.10.7
```

### Tool versions

Some tools, like `java`, `node` and `pnpm`, accept a partial version (`install-tool node 22`) and install the newest matching release.
Read the [tool-specific versions](./docs/tools.md#Versions-install-tool) docs for more details.

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
