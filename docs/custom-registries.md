# Custom registries

It's now possible to change the registries used by the `install-tool` and `prepare-tool` commands.
This can be done by url replacements.
You can find the default urls in the tool sections below.

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

# renovate: datasource=docker
RUN install-tool dart 2.18.0
```

## GitHub (github.com)

GitHub releases are redirecting from `https://github.com/<org>/<repo>/releases/<version>/<file>` to `https://objects.githubusercontent.com/<some-url>` which seems to be an Amazon S3 bucket.

## `bazelisk`

Bazelisk releases are downloaded from:

- `https://github.com/bazelbuild/bazelisk/releases`

Samples:

```txt
https://github.com/bazelbuild/bazelisk/releases/v1.19.0/bazelisk-linux-amd64
https://github.com/bazelbuild/bazelisk/releases/v1.19.0/bazelisk-linux-arm64
```

## `bun`

Bun releases are downloaded from:

- `https://github.com/oven-sh/bun/releases`

Samples:

```txt
https://github.com/oven-sh/bun/releases/bun-v1.0.0/bun-linux-x64.zip
https://github.com/oven-sh/bun/releases/bun-v1.0.0/bun-linux-aarch64.zip
https://github.com/oven-sh/bun/releases/bun-v1.0.0/SHASUMS256.txt
```

## `dart`

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

## `docker`

Docker releases are downloaded from:

- `https://download.docker.com/linux/static/stable`

Samples:

```txt
https://download.docker.com/linux/static/stable/x86_64/docker-20.10.7.tgz
https://download.docker.com/linux/static/stable/aarch64/docker-24.0.5.tgz
```

## `dotnet`

Dotnet releases are downloaded from:

- `https://dotnetcli.azureedge.net/dotnet/Sdk`

Samples:

```txt
https://dotnetcli.azureedge.net/dotnet/Sdk/6.0.413/dotnet-sdk-6.0.413-linux-x64.tar.gz
https://dotnetcli.azureedge.net/dotnet/Sdk/6.0.413/dotnet-sdk-6.0.413-linux-arm64.tar.gz
```

## `erlang`

Erlang releases are downloaded from:

- `https://github.com/containerbase/erlang-prebuild/releases`

Samples:

```txt
https://github.com/containerbase/erlang-prebuild/releases/25.3.2.8/erlang-25.3.2.8-jammy-x86_x64.tar.xz.sha512
https://github.com/containerbase/erlang-prebuild/releases/25.3.2.8/erlang-25.3.2.8-jammy-x86_x64.tar.xz
```

### `elixir`

Elixir releases are downloaded from:

- `https://github.com/elixir-lang/elixir/releases`

Samples:

```txt
https://github.com/elixir-lang/elixir/releases/v1.16.0/elixir-otp-24.zip
https://github.com/elixir-lang/elixir/releases/v1.14.0/elixir-otp-23.zip
https://github.com/elixir-lang/elixir/releases/v1.13.0/Precompiled.zip
```

## `flutter`

Flutter releases are downloaded from:

- `https://github.com/containerbase/flutter-prebuild/releases`
- `https://github.com/flutter/flutter.git`

The first url is preferred and the second is used as fallback for older versions.

Samples:

```txt
https://github.com/containerbase/flutter-prebuild/releases/3.13.7/flutter-3.13.7-x86_64.tar.xz
https://github.com/containerbase/flutter-prebuild/releases/3.13.7/flutter-3.13.7-x86_64.tar.xz.sha512
https://github.com/containerbase/flutter-prebuild/releases/3.13.7/flutter-3.13.7-aarch64.tar.xz
https://github.com/containerbase/flutter-prebuild/releases/3.13.7/flutter-3.13.7-aarch64.tar.xz.sha512
https://github.com/flutter/flutter.git
```

## `flux`

Flux releases are downloaded from:

- `https://github.com/fluxcd/flux2/releases`

Samples:

```txt
https://github.com/fluxcd/flux2/releases/v0.19.0/flux_0.19.0_linux_amd64.tar.gz
https://github.com/fluxcd/flux2/releases/v2.1.0/flux_2.1.0_linux_arm64.tar.gz
```

## `git`

Git is downloaded from:

- `http://ppa.launchpad.net/git-core/ppa/ubuntu`

Git is installed via `apt` package manager.

### `git-lfs`

Git LFS releases are downloaded from:

- `https://github.com/git-lfs/git-lfs/releases`

Samples:

```txt
https://github.com/git-lfs/git-lfs/releases/v3.4.1/git-lfs-linux-amd64-v3.4.1.tar.gz
```

## gleam

Gleam releases are downloaded from:

- `https://github.com/gleam-lang/gleam/releases/download`

Samples:

```txt
https://github.com/gleam-lang/gleam/releases/download/v0.34.1/gleam-v0.34.1-aarch64-unknown-linux-musl.tar.gz
https://github.com/gleam-lang/gleam/releases/download/v0.34.1/gleam-v0.34.1-aarch64-unknown-linux-musl.tar.gz.sha512
https://github.com/gleam-lang/gleam/releases/download/v0.34.1/gleam-v0.34.1-x86_64-unknown-linux-musl.tar.gz
https://github.com/gleam-lang/gleam/releases/download/v0.34.1/gleam-v0.34.1-x86_64-unknown-linux-musl.tar.gz.sha512
```

## `golang`

Go releases are downloaded from:

- `https://github.com/containerbase/golang-prebuild/releases`
- `https://dl.google.com/go/`
- `https://go.dev/dl/?mode=json&include=all`

The second url is used as fallback for older versions.
The third url is used to find the checksums.

Samples:

```txt
https://github.com/containerbase/golang-prebuild/releases/download/1.22.5/golang-1.22.5-x86_64.tar.xz.sha512
https://github.com/containerbase/golang-prebuild/releases/download/1.22.5/golang-1.22.5-x86_64.tar.xz
https://github.com/containerbase/golang-prebuild/releases/download/1.22.5/golang-1.22.5-aarch64.tar.xz.sha512
https://github.com/containerbase/golang-prebuild/releases/download/1.22.5/golang-1.22.5-aarch64.tar.xz
https://go.dev/dl/?mode=json&include=all
https://dl.google.com/go/go1.21.6.linux-arm64.tar.gz
https://dl.google.com/go/go1.17.5.linux-amd64.tar.gz
```

## `helm`

Helm releases are downloaded from:

- `https://get.helm.sh`

Samples:

```txt
https://get.helm.sh/helm-v3.7.1-linux-amd64.tar.gz
```

## `helmfile`

Helmfile releases are downloaded from:

- `https://github.com/helmfile/helmfile/releases`

Samples:

```txt
https://github.com/helmfile/helmfile/releases/download/v0.161.0/helmfile_0.161.0_linux_amd64.tar.gz
```

## `java`

Java releases are downloaded from:

- `https://api.adoptium.net/v3/assets/version/`
- `https://github.com/adoptium/temurin<major>-binaries/releases`

Each major version has it's own GitHub repository.

Samples:

```txt
https://api.adoptium.net/v3/assets/version/21.0.1+12.0.LTS?architecture=x86_64&image_type=jre&heap_size=normal&os=linux&page=0&page_size=1&project=jdk&semver=true
https://api.adoptium.net/v3/assets/version/11.0.22+7?architecture=x86_64&image_type=jdk&heap_size=normal&os=linux&page=0&page_size=1&project=jdk&semver=true
https://github.com/adoptium/temurin21-binaries/releases/jdk-21.0.1%2B12/OpenJDK21U-jre_x64_linux_hotspot_21.0.1_12.tar.gz
https://github.com/adoptium/temurin11-binaries/releases/jdk-11.0.22%2B7/OpenJDK11U-jdk_x64_linux_hotspot_11.0.22_7.tar.gz
```

### `gradle`

Gradle releases are downloaded from:

- `https://services.gradle.org/distributions`
- `https://services.gradle.org/versions/current`

The second url is only used when `latest` is passed as version.
Then we try to find the latest version from the that url.

Samples:

```txt
https://services.gradle.org/versions/current
https://services.gradle.org/distributions/gradle-8.5-bin.zip
https://services.gradle.org/distributions/gradle-6.9.4-bin.zip
```

### `maven`

Maven releases are downloaded from:

- `https://github.com/containerbase/maven-prebuild/releases`
- `https://archive.apache.org/dist/maven`

The first url is preferred and the second is used as fallback for older versions.

Samples:

```txt
https://github.com/containerbase/maven-prebuild/releases/download/3.0.4/maven-3.0.4.tar.xz.sha512
https://github.com/containerbase/maven-prebuild/releases/download/3.0.4/maven-3.0.4.tar.xz
https://github.com/containerbase/maven-prebuild/releases/latest/download/version
https://archive.apache.org/dist/maven/maven-3/3.0.4/binaries/apache-maven-3.0.4-bin.tar.gz
https://archive.apache.org/dist/maven/maven-3/3.0.4/binaries/apache-maven-3.0.4-bin.tar.gz.sha1
https://archive.apache.org/dist/maven/maven-3/3.6.2/binaries/apache-maven-3.6.2-bin.tar
https://archive.apache.org/dist/maven/maven-3/3.6.2/binaries/apache-maven-3.6.2-bin.tar.gz.sha512
```

### `sbt`

SBT releases are downloaded from:

- `https://github.com/sbt/sbt/releases`

Samples:

```txt
https://github.com/sbt/sbt/releases/download/v1.5.5/sbt-1.5.5.tgz
```

### `scala`

Scala releases are downloaded from:

- `https://downloads.lightbend.com`
- `https://github.com/lampepfl/dotty/releases`

The second url will be used soon for scala v3.

Samples:

```txt
https://downloads.lightbend.com/scala/2.13.6/scala-2.13.6.tgz
```

## `jb`

jsonnet-bundler releases are downloaded from:

- `https://github.com/jsonnet-bundler/jsonnet-bundler/releases`

Samples:

```txt
https://github.com/jsonnet-bundler/jsonnet-bundler/releases/download/v0.5.1/jb-linux-amd64
```

## `kustomize`

Kustomize releases are downloaded from:

- `https://github.com/kubernetes-sigs/kustomize/releases`

Samples:

```txt
https://github.com/kubernetes-sigs/kustomize/releases/download/kustomize%2Fv5.3.0/kustomize_v5.3.0_linux_amd64.tar.gz
```

## `nix`

Nix releases are downloaded from:

- `https://hydra.nixos.org/job/nix`
- `https://releases.nixos.org`

The second url will be used soon (#2066).

Samples:

```txt
https://hydra.nixos.org/job/nix/maintenance-2.4/buildStatic.x86_64-linux/latest/download-by-type/file/binary-dist
https://releases.nixos.org/nix/nix-2.2/nix-2.2-aarch64-linux.tar.bz2
https://releases.nixos.org/nix/nix-2.2/nix-2.2-aarch64-linux.tar.bz2.sha256
```

## `node`

Node releases are downloaded from:

- `https://github.com/containerbase/node-prebuild/releases`
- `https://nodejs.org/dist`

The first url is preferred and the second is used as fallback for older versions.

Samples:

```txt
https://github.com/containerbase/node-prebuild/releases/18.12.0/node-18.12.0-jammy-x86_x64.tar.xz.sha512
https://github.com/containerbase/node-prebuild/releases/18.12.0/node-18.12.0-jammy-aarch64.tar.xz
https://github.com/containerbase/node-prebuild/releases/18.12.0/node-18.12.0-focal-x86_x64.tar.xz.sha512
https://github.com/containerbase/node-prebuild/releases/18.12.0/node-18.12.0-focal-aarch64.tar.xz
https://nodejs.org/dist/v20.0.0/SHASUMS256.txt
https://nodejs.org/dist/v20.0.0/node-v20.0.0-linux-x64.tar.xz
https://nodejs.org/dist/v20.0.0/node-v20.0.0-linux-arm64.tar.xz
https://nodejs.org/dist/index.json
```

The url `https://nodejs.org/dist/index.json` is used to find the latest version if no version was provided.

### `npm` tools

Npm tools are downloaded from:

- `https://registry.npmjs.org`
- `https://github.com/containerbase/node-re2-prebuild/releases` (renovate only)

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

Renovate additionally uses the following urls for downloading `re2` binaries.

```txt
https://github.com/containerbase/node-re2-prebuild/releases/1.20.9/linux-arm64-115.br
https://github.com/containerbase/node-re2-prebuild/releases/1.20.9/linux-x64-108.br
```

## `php`

PHP releases are downloaded from:

- `https://github.com/containerbase/php-prebuild/releases`

Samples:

```txt
https://github.com/containerbase/php-prebuild/releases/8.3.2/php-8.3.2-jammy-x86_x64.tar.xz.sha512
https://github.com/containerbase/php-prebuild/releases/8.3.2/php-8.3.2-jammy-x86_x64.tar.xz
```

### `composer`

Composer releases are downloaded from:

- `https://github.com/containerbase/maven-prebuild/releases`
- `https://getcomposer.org/download`
- `https://getcomposer.org/versions`

The first url is preferred and the second is used as fallback for older versions.
The last url is only used when `latest` or nothing is passed as version.
Then we try to find the latest version from getcomposer.org.

Samples:

```txt
https://github.com/containerbase/composer-prebuild/releases/2.7.7/composer-2.7.7.tar.xz.sha512
https://github.com/containerbase/composer-prebuild/releases/2.7.7/composer-2.7.7.tar.xz
https://getcomposer.org/download/2.6.6/composer.phar.sha256sum
https://getcomposer.org/download/2.6.6/composer.phar
https://getcomposer.org/versions
```

## `powershell`

Powershell releases are downloaded from:

- `https://github.com/PowerShell/PowerShell/releases`

Samples:

```txt
https://github.com/PowerShell/PowerShell/releases/download/v7.4.1/powershell-7.4.1-linux-arm64.tar.gz
https://github.com/PowerShell/PowerShell/releases/download/v7.4.1/powershell-7.4.1-linux-x64.tar.gz
https://github.com/PowerShell/PowerShell/releases/download/v7.4.1/hashes.sha256
```

## `python`

Python releases are downloaded from:

- `https://github.com/containerbase/python-prebuild/releases`
- `https://pypi.org/simple`

The second url is used to install and update global `pip` and `virtualenv` packages of the python package.

Samples:

```txt
https://github.com/containerbase/python-prebuild/releases/3.12.1/python-3.12.1-jammy-x86_x64.tar.xz.sha512
https://github.com/containerbase/python-prebuild/releases/3.12.1/python-3.12.1-jammy-x86_x64.tar.xz
```

## `pip` tools

Pip tools are downloaded from:

- `https://pypi.org/simple`

Those tools are installed via `pip` package manager.

Known tools:

- `checkov`
- `conan`
- `hashin`
- `pdm`
- `pip-tools`
- `pipenv`
- `poetry`

## `ruby`

Ruby releases are downloaded from:

- `https://github.com/containerbase/ruby-prebuild/releases`

Samples:

```txt
https://github.com/containerbase/ruby-prebuild/releases/3.0.3/ruby-3.0.3-jammy-x86_x64.tar.xz.sha512
https://github.com/containerbase/ruby-prebuild/releases/3.0.3/ruby-3.0.3-jammy-x86_x64.tar.xz
```

### `gem` tools

Gem tools are downloaded from:

- `https://rubygems.org`

Those tools are installed via `gem` package manager.

Known tools:

- `bundler`
- `cocoapods`

The `install-gem` command uses those urls too.

## `rust`

Rust releases are downloaded from:

- `https://static.rust-lang.org/dist/`

Samples:

```txt
https://static.rust-lang.org/dist/rust-1.75.0-aarch64-unknown-linux-gnu.tar.gz
https://static.rust-lang.org/dist/rust-1.75.0-x86_64-unknown-linux-gnu.tar.gz
```

## `rye`

Rye releases are downloaded from:

- `https://github.com/astral-sh/rye/releases`

Samples:

```txt
https://github.com/astral-sh/rye/releases/download/0.34.0/rye-x86_64-linux.gz.sha256
https://github.com/astral-sh/rye/releases/download/0.34.0/rye-x86_64-linux.gz
```

## `swift`

Swift releases are downloaded from:

- `https://download.swift.org`

Samples:

```txt
https://download.swift.org/swift-5.7-release/ubuntu2204/swift-5.7-RELEASE/swift-5.7-RELEASE-ubuntu22.04.tar.gz
```

## `terraform`

Terraform releases are downloaded from:

- `https://releases.hashicorp.com`

Samples:

```txt
https://releases.hashicorp.com/terraform/1.0.11/terraform_1.0.11_linux_amd64.zip
https://releases.hashicorp.com/terraform/1.0.11/terraform_1.0.11_linux_arm64.zip
```

## `vendir`

Vendir releases are downloaded from:

- `https://github.com/vmware-tanzu/carvel-vendir/releases`

Samples:

```txt
https://github.com/vmware-tanzu/carvel-vendir/releases/download/v0.22.0/vendir-linux-amd64
```
