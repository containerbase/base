# Custom registries

It's now possible to change the registries used by the `install-tool` and `prepare-tool` commands.
This can be done by url replacements.

## General configuration

The number of `URL_REPLACE_*_FROM` and `URL_REPLACE_*_TO` environment variables must match.
Theses variables are case sensitive.
The numbers will be processed in numerical order and can have gaps.

```Dockerfile
FROM containerbase/base

ENV URL_REPLACE_5_FROM=https://storage.googleapis.com/dart-archive/channels/stable/release/
ENV URL_REPLACE_5_TO=https://artifactory.proxy.test/virtual/dart-archive/

ENV URL_REPLACE_0_FROM=https://download.docker.com/linux/static/stable/
ENV URL_REPLACE_0_TO=https://artifactory.proxy.test/virtual/docker-com/

# renovate: datasource=github-releases packageName=moby/moby
RUN install-tool docker v24.0.2

# renovate datasource=docker
RUN install-tool dart 2.18.0
```

## dart

Dart releases are downloaded from:

- `https://storage.googleapis.com/dart-archive/channels/stable/release`

Samples:

```txt
https://storage.googleapis.com/dart-archive/channels/stable/release/1.11.0/sdk/dartsdk-linux-x64-release.zip
https://storage.googleapis.com/dart-archive/channels/stable/release/2.18.0/sdk/dartsdk-linux-x64-release.zip
https://storage.googleapis.com/dart-archive/channels/stable/release/2.19.4/sdk/dartsdk-linux-x64-release.zip.sha256sum
https://storage.googleapis.com/dart-archive/channels/stable/release/2.19.4/sdk/dartsdk-linux-arm64-release.zip
https://storage.googleapis.com/dart-archive/channels/stable/release/2.19.4/sdk/dartsdk-linux-arm64-release.zip.sha256sum

```

## docker

Docker releases are downloaded from:

- `https://download.docker.com/linux/static/stable`

Samples:

```txt
https://download.docker.com/linux/static/stable/x86_64/docker-20.10.7.tgz
https://download.docker.com/linux/static/stable/aarch64/docker-24.0.5.tgz

```

## dotnet

Dotnet releases are downloaded from:

- `https://dotnetcli.azureedge.net/dotnet/Sdk`

Samples:

```txt
https://dotnetcli.azureedge.net/dotnet/Sdk/6.0.413/dotnet-sdk-6.0.413-linux-x64.tar.gz
https://dotnetcli.azureedge.net/dotnet/Sdk/6.0.413/dotnet-sdk-6.0.413-linux-arm64.tar.gz
```

## flux

Flux releases are downloaded from:

- `https://github.com/fluxcd/flux2/releases/download`

Samples:

```txt
https://github.com/fluxcd/flux2/releases/download/v0.19.0/flux_0.19.0_linux_amd64.tar.gz
https://github.com/fluxcd/flux2/releases/download/v2.1.0/flux_2.1.0_linux_arm64.tar.gz
```

## node

Node releases are downloaded from:

- `https://github.com/containerbase/node-prebuild/releases/download`
- `https://nodejs.org/dist`

The first url is preferred and the second is used as fallback for older versions.

Samples:

```txt
https://github.com/containerbase/node-prebuild/releases/download/18.12.0/node-18.12.0-jammy-x86_x64.tar.xz.sha512
https://github.com/containerbase/node-prebuild/releases/download/18.12.0/node-18.12.0-jammy-aarch64.tar.xz
https://github.com/containerbase/node-prebuild/releases/download/18.12.0/node-18.12.0-focal-x86_x64.tar.xz.sha512
https://github.com/containerbase/node-prebuild/releases/download/18.12.0/node-18.12.0-focal-aarch64.tar.xz
https://nodejs.org/dist/v20.0.0/SHASUMS256.txt
https://nodejs.org/dist/v20.0.0/node-v20.0.0-linux-x64.tar.xz
https://nodejs.org/dist/v20.0.0/node-v20.0.0-linux-arm64.tar.xz
```

### npm tools

Npm tools are downloaded from:

- `https://registry.npmjs.org`

Those tools are installed via `npm` package manager.

Known tools:

- `bower`
- `corepack`
- `lerna`
- `npm`
- `pnpm`
- `renovate`
- `yarn`
- `yarn-slim`

The `install-npm` command uses those urls too.

## ruby

Ruby releases are downloaded from:

- `https://github.com/containerbase/ruby-prebuild/releases/download`

Samples:

```txt
https://github.com/containerbase/ruby-prebuild/releases/download/3.0.3/ruby-3.0.3-jammy-x86_x64.tar.xz.sha512
https://github.com/containerbase/ruby-prebuild/releases/download/3.0.3/ruby-3.0.3-jammy-x86_x64.tar.xz
```

### gem tools

Gem tools are downloaded from:

- `https://rubygems.org`

Those tools are installed via `gem` package manager.

Known tools:

- `bundler`
- `cocoapods`

The `install-gem` command uses those urls too.
