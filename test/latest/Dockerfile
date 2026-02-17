ARG BASE_IMAGE=containerbase

#--------------------------------------
# Image: containerbase
#--------------------------------------
FROM ghcr.io/containerbase/ubuntu:24.04 AS containerbase

ENV BASH_ENV=/usr/local/etc/env
SHELL ["/bin/bash" , "-c"]

ARG TARGETARCH
COPY dist/docker/ /
COPY dist/cli/containerbase-cli-${TARGETARCH} /usr/local/containerbase/bin/containerbase-cli

ARG APT_HTTP_PROXY
ARG CONTAINERBASE_CDN
ARG CONTAINERBASE_DEBUG
ARG CONTAINERBASE_LOG_LEVEL

RUN install-containerbase

#--------------------------------------
# Image: base
#--------------------------------------
FROM ${BASE_IMAGE} AS base

RUN touch /.dummy

ARG APT_HTTP_PROXY
ARG CONTAINERBASE_CDN
ARG CONTAINERBASE_DEBUG
ARG CONTAINERBASE_LOG_LEVEL

#--------------------------------------
# build
#--------------------------------------
FROM base AS build

COPY test/latest/src/ /

WORKDIR /test

# create test certs
RUN set -ex; \
  openssl genrsa 2048 > ca.key; \
  openssl genrsa 2048 > renovate.key; \
  openssl req -config ca.conf -x509 -new -nodes -key ca.key -out ca.pem; \
  openssl req -config cert.conf -new -nodes -key renovate.key -out renovate.csr; \
  openssl x509 -req -in renovate.csr -CA ca.pem -CAkey ca.key -out renovate.pem -extfile cert.conf -extensions v3_req; \
  rm ca.key; \
  cat renovate.pem ca.pem > renovate-chain.pem;

# install root ca
# RUN  set -ex \
#   && cp ca.pem /usr/local/share/ca-certificates/renovate-ca.crt \
#   && update-ca-certificates


#--------------------------------------
# test: custom root ca
#--------------------------------------
FROM base AS testa

# install nginx for request testing
RUN install-apt nginx

# renovate: datasource=github-releases packageName=containerbase/node-prebuild versioning=node
RUN install-tool node 24.13.1

# renovate: datasource=github-releases packageName=containerbase/php-prebuild
RUN install-tool php 8.5.3
RUN set -ex; [ $(stat --format '%u' "/usr/local/bin/php") -eq ${USER_ID} ]

# renovate: datasource=github-releases packageName=PowerShell/PowerShell
RUN install-tool powershell v7.5.4

# renovate: datasource=github-releases depName=python packageName=containerbase/python-prebuild
ARG PYTHON_VERSION=3.14.3
RUN install-tool python
RUN set -ex; [ $(stat --format '%u' "/usr/local/bin/python") -eq ${USER_ID} ]

# Do not renovate ruby 2.x
RUN install-tool ruby 2.7.7
RUN set -ex; [ $(stat --format '%u' "/usr/local/bin/ruby") -eq ${USER_ID} ]

COPY --link --from=build /test /test
COPY --link --from=build /etc/nginx/sites-enabled/default /etc/nginx/sites-enabled/default

WORKDIR /test

RUN set -ex; \
  openssl x509 -noout -text -in ca.pem; \
  openssl x509 -noout -text -in renovate.pem; \
  true

RUN set -ex; \
  nginx; \
  su -c 'SSL_CERT_FILE=/test/ca.pem curl -svo /dev/null https://localhost' ${USER_NAME}; \
  su -c 'SSL_CERT_FILE=/test/ca.pem curl -svo /dev/null https://buildkitsandbox' ${USER_NAME}; \
  su -c 'SSL_CERT_FILE=/test/ca.pem node request.mjs' ${USER_NAME}; \
  su -c 'NODE_EXTRA_CA_CERTS=/test/ca.pem node request.mjs' ${USER_NAME}; \
  su -c 'SSL_CERT_FILE=/test/ca.pem php request.php' ${USER_NAME}; \
  SSL_CERT_FILE=/test/ca.pem pwsh -c "&{ \$ErrorActionPreference='Stop'; invoke-webrequest https://buildkitsandbox }"; \
  su -c 'SSL_CERT_FILE=/test/ca.pem python request.py' ${USER_NAME}; \
  su -c 'SSL_CERT_FILE=/test/ca.pem ruby request.rb' ${USER_NAME}; \
  true


# install root ca
RUN  set -ex \
  && cp ca.pem /usr/local/share/ca-certificates/renovate-ca.crt \
  && update-ca-certificates

# use global root certs
RUN set -ex; \
  nginx; \
  su -c 'curl -svo /dev/null https://buildkitsandbox' ${USER_NAME}; \
  su -c 'node request.mjs' ${USER_NAME}; \
  su -c 'npm_config_registry=https://localhost npm ping' ${USER_NAME}; \
  su -c 'php request.php' ${USER_NAME}; \
  pwsh -c "&{ \$ErrorActionPreference='Stop'; invoke-webrequest https://buildkitsandbox }"; \
  su -c 'python request.py' ${USER_NAME}; \
  su -c 'ruby request.rb' ${USER_NAME}; \
  true


#--------------------------------------
# test: gitpod
#--------------------------------------
FROM ghcr.io/containerbase/ubuntu:24.04 AS testb-gitpod

ARG USER_NAME=gitpod
ARG USER_ID=33333
ARG PRIMARY_GROUP_ID=${USER_ID}
ARG APT_HTTP_PROXY
ARG CONTAINERBASE_CDN
ARG CONTAINERBASE_DEBUG
ARG CONTAINERBASE_LOG_LEVEL

# Set env and shell
ENV BASH_ENV=/usr/local/etc/env PATH=/home/$USER_NAME/bin:$PATH
SHELL ["/bin/bash" , "-c"]

COPY --link --from=build /test/ca.pem /usr/local/share/ca-certificates/renovate-ca.crt

# Set up containerbase
COPY --link --from=build /usr/local/sbin/ /usr/local/sbin/
COPY --link --from=build /usr/local/containerbase/ /usr/local/containerbase/
RUN install-containerbase

# validate custom cert
COPY --link --from=build /test/renovate.pem /renovate.pem
RUN openssl verify /renovate.pem

# Test start
RUN touch /.dummy

USER $USER_NAME

SHELL ["/bin/sh", "-c"]

RUN set -ex; id | grep "uid=${USER_ID}(${USER_NAME}) gid=${PRIMARY_GROUP_ID}(${USER_NAME}) groups=${USER_ID}(${USER_NAME}),0(root)"

# renovate: datasource=docker packageName=hashicorp/terraform versioning=docker
RUN install-tool terraform 1.14.5

WORKDIR /tmp
RUN mkdir $HOME/.tf-cache && TF_PLUGIN_CACHE_DIR=$HOME/.tf-cache terraform init

#--------------------------------------
# test: ignore tools
#--------------------------------------
FROM base AS testc

RUN prepare-tool docker

# TODO: move to prepare of git-lfs
# renovate: datasource=github-tags packageName=git/git
RUN install-tool git v2.53.0

USER 12021

RUN set -ex; id; id | grep "uid=${USER_ID}(${USER_NAME}) gid=0(root) groups=0(root),999(docker),${USER_ID}(${USER_NAME})"

ARG IGNORED_TOOLS=powershell,node

# renovate: datasource=github-releases packageName=fluxcd/flux2
RUN install-tool flux v2.7.5

# renovate: datasource=github-releases packageName=git-lfs/git-lfs
RUN install-tool git-lfs v3.7.1

# renovate: datasource=github-releases packageName=PowerShell/PowerShell
RUN install-tool powershell v7.5.4

# renovate: datasource=github-releases packageName=containerbase/node-prebuild versioning=node
RUN install-tool node 24.13.1

# renovate: datasource=github-releases packageName=moby/moby
RUN install-tool docker v28.5.2

#--------------------------------------
# test: bin path has 777
#--------------------------------------
FROM base AS testd

RUN [ $(stat --format '%a' "/usr/local/bin") -eq 777 ]

ENV CONTAINERBASE_LOG_LEVEL=trace
RUN prepare-tool all

RUN set -ex; [ -d /usr/local/erlang ] && echo "works" || exit 1;

#--------------------------------------
# test: bazelisk, bun, deno, devbox, helmfile, kustomize, skopeo, tofu, vendir
#--------------------------------------
FROM base AS teste

# renovate: datasource=github-releases packageName=bazelbuild/bazelisk
RUN install-tool bazelisk v1.28.1

# renovate: datasource=npm
RUN install-tool bun 1.3.9

# renovate: datasource=github-releases packageName=denoland/deno
RUN install-tool deno 2.6.9

# renovate: datasource=github-releases packageName=chainguard-dev/apko
RUN install-tool apko 1.1.7

# renovate: datasource=github-releases packageName=jetify-com/devbox
RUN install-tool devbox 0.16.0

# renovate: datasource=github-releases packageName=gleam-lang/gleam
RUN install-tool gleam 1.14.0

# renovate: datasource=github-releases packageName=kubernetes/kubernetes
RUN install-tool kubectl v1.35.1

# renovate: datasource=github-releases packageName=jdx/mise
RUN install-tool mise 2026.2.13

# renovate: datasource=github-releases packageName=containerbase/skopeo-prebuild
RUN install-tool skopeo 1.22.0

# renovate: datasource=github-releases packageName=getsops/sops
RUN install-tool sops v3.11.0

# renovate: datasource=github-releases packageName=opentofu/opentofu
RUN install-tool tofu 1.11.5

# renovate: datasource=github-releases packageName=protocolbuffers/protobuf versioning=docker
RUN install-tool protoc 33.5

# renovate: datasource=github-releases depName=vendir packageName=vmware-tanzu/carvel-vendir
ARG VENDIR_VERSION=v0.45.2

# renovate: datasource=github-releases depName=helmfile packageName=helmfile/helmfile
ARG HELMFILE_VERSION=v1.2.3

# renovate: datasource=github-releases depName=kustomize packageName=kubernetes-sigs/kustomize
ARG KUSTOMIZE_VERSION=5.8.1

RUN install-tool vendir "${VENDIR_VERSION}"

RUN install-tool helmfile "${HELMFILE_VERSION}"

RUN install-tool kustomize "${KUSTOMIZE_VERSION}"

RUN set -ex; vendir --version

RUN set -ex; helmfile version

RUN set -ex; kustomize version

SHELL [ "/bin/sh", "-c" ]

RUN vendir --version | grep "${VENDIR_VERSION#v}"

RUN helmfile version | grep "${HELMFILE_VERSION#v}"

RUN kustomize version | grep "${KUSTOMIZE_VERSION}"

USER 12021

RUN bazel --version

RUN vendir --version | grep "${VENDIR_VERSION#v}"

RUN helmfile version | grep "${HELMFILE_VERSION#v}"

RUN kustomize version | grep "${KUSTOMIZE_VERSION}"


#--------------------------------------
# test: db permissions
#--------------------------------------
FROM base AS testf

# renovate: datasource=github-releases depName=protoc packageName=protocolbuffers/protobuf versioning=docker
ARG PROTOC_VERSION=33.5

RUN set -ex; \
  ls -lah /opt/containerbase/; \
  ls -lah /opt/containerbase/data/; \
  install-tool protoc; \
  true

USER 12021

RUN set -ex; \
  ls -lah /opt/containerbase/; \
  ls -lah /opt/containerbase/data/; \
  install-tool protoc; \
  true

RUN set -ex; \
  # install older version; \
  install-tool protoc v25.7; \
  # install latest version; \
  install-tool protoc; \
  # uninstall older version; \
  uninstall-tool protoc v25.7; \
  protoc --version; \
  true

#--------------------------------------
# test: docker (rootless)
#--------------------------------------
FROM base AS test-docker

RUN prepare-tool docker

USER 12021

# renovate: datasource=github-releases packageName=moby/moby
RUN install-tool docker v28.5.2

# renovate: datasource=github-releases packageName=docker/buildx
RUN install-tool buildx v0.31.1

# renovate: datasource=github-releases packageName=docker/compose
RUN install-tool docker-compose v5.0.2

RUN set -ex; \
  docker buildx version | grep github.com/docker/buildx; \
  docker compose version | grep 'Docker Compose version'; \
  true;

USER root

RUN set -ex; \
  docker buildx version | grep github.com/docker/buildx; \
  docker compose version | grep 'Docker Compose version'; \
  true;

#--------------------------------------
# test: mono (rootless)
#--------------------------------------
FROM base AS test-mono

RUN prepare-tool mono

USER 12021

# renovate: datasource=github-releases packageName=containerbase/mono-prebuild
RUN install-tool mono 6.14.1

# renovate: datasource=nuget packageName=NuGet.CommandLine
RUN install-tool nuget 7.3.0

RUN nuget search nuget.commandline -Take 1

#--------------------------------------
# final
#--------------------------------------
FROM base

COPY --link --from=testa /.dummy /.dummy
COPY --link --from=testb-gitpod /.dummy /.dummy
COPY --link --from=testc /.dummy /.dummy
COPY --link --from=testd /.dummy /.dummy
COPY --link --from=teste /.dummy /.dummy
COPY --link --from=testf /.dummy /.dummy
COPY --link --from=test-docker /.dummy /.dummy
COPY --link --from=test-mono /.dummy /.dummy
