#--------------------------------------
# Image: base
#--------------------------------------
FROM ubuntu:focal as base

RUN touch /.dummy

ARG APT_HTTP_PROXY
ARG CONTAINERBASE_CDN
ARG CONTAINERBASE_DEBUG

ENV BASH_ENV=/usr/local/etc/env
SHELL ["/bin/bash" , "-c"]

ARG TARGETARCH

COPY dist/docker/ /
COPY dist/cli/containerbase-cli-${TARGETARCH} /usr/local/containerbase/bin/containerbase-cli

RUN install-containerbase

#--------------------------------------
# build
#--------------------------------------
FROM base as build

# install nginx for request testing
RUN install-apt nginx

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
FROM build as testa

# renovate: datasource=node
RUN install-tool node v20.15.0

# renovate: datasource=github-releases packageName=containerbase/python-prebuild
RUN install-tool php 7.4.14
RUN set -ex; [ $(stat --format '%u' "/usr/local/bin/php") -eq ${USER_ID} ]

# renovate: datasource=github-releases packageName=PowerShell/PowerShell
RUN install-tool powershell v7.4.3

# renovate: datasource=github-releases depName=python packageName=containerbase/python-prebuild
ARG PYTHON_VERSION=3.12.4
RUN install-tool python
RUN set -ex; [ $(stat --format '%u' "/usr/local/bin/python") -eq ${USER_ID} ]

# Do not renovate ruby 2.x
RUN install-tool ruby 2.6.4
RUN set -ex; [ $(stat --format '%u' "/usr/local/bin/ruby") -eq ${USER_ID} ]

RUN set -ex; \
  openssl x509 -noout -text -in ca.pem; \
  openssl x509 -noout -text -in renovate.pem;

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
FROM ubuntu:focal as testb-gitpod

ARG USER_NAME=gitpod
ARG USER_ID=33333
ARG PRIMARY_GROUP_ID=${USER_ID}
ARG APT_HTTP_PROXY
ARG CONTAINERBASE_CDN
ARG CONTAINERBASE_DEBUG

# Set env and shell
ENV BASH_ENV=/usr/local/etc/env PATH=/home/$USER_NAME/bin:$PATH
SHELL ["/bin/bash" , "-c"]

COPY --from=build /test/ca.pem /usr/local/share/ca-certificates/renovate-ca.crt

# Set up containerbase
COPY --from=build /usr/local/sbin/ /usr/local/sbin/
COPY --from=build /usr/local/containerbase/ /usr/local/containerbase/
RUN install-containerbase

# validate custom cert
COPY --from=build /test/renovate.pem /renovate.pem
RUN openssl verify /renovate.pem

# Test start
RUN touch /.dummy

USER $USER_NAME

SHELL ["/bin/sh", "-c"]

RUN set -ex; id | grep "uid=${USER_ID}(${USER_NAME}) gid=${PRIMARY_GROUP_ID}(${USER_NAME}) groups=${USER_ID}(${USER_NAME}),0(root)"

# renovate: datasource=docker packageName=hashicorp/terraform versioning=docker
RUN install-tool terraform 1.9.0

WORKDIR /tmp
RUN mkdir $HOME/.tf-cache && TF_PLUGIN_CACHE_DIR=$HOME/.tf-cache terraform init

#--------------------------------------
# test: ignore tools
#--------------------------------------
FROM build as testc

RUN prepare-tool docker

# TODO: move to prepare of git-lfs
# renovate: datasource=github-tags packageName=git/git
RUN install-tool git v2.45.2

USER 1000

RUN set -ex; id; id | grep "uid=${USER_ID}(${USER_NAME}) gid=0(root) groups=0(root),999(docker),${USER_ID}(${USER_NAME})"

ARG IGNORED_TOOLS=powershell,node

# renovate: datasource=github-releases packageName=fluxcd/flux2
RUN install-tool flux v2.3.0

# renovate: datasource=github-releases packageName=git-lfs/git-lfs
RUN install-tool git-lfs v3.5.1

# renovate: datasource=github-releases packageName=PowerShell/PowerShell
RUN install-tool powershell v7.4.3

# renovate: datasource=node
RUN install-tool node v20.15.0

# renovate: datasource=github-releases packageName=moby/moby
RUN install-tool docker v27.0.3

#--------------------------------------
# test: bin path has 777
#--------------------------------------
FROM base as testd

RUN [ $(stat --format '%a' "/usr/local/bin") -eq 777 ]

RUN prepare-tool all

RUN set -ex; [ -d /usr/local/erlang ] && echo "works" || exit 1;

#--------------------------------------
# test: bazelisk, bun, vendir, helmfile, kustomize
#--------------------------------------
FROM base as teste

# renovate: datasource=github-releases packageName=bazelbuild/bazelisk
RUN install-tool bazelisk v1.20.0

# renovate: datasource=npm
RUN install-tool bun 1.1.17

# renovate: datasource=github-releases packageName=gleam-lang/gleam
RUN install-tool gleam 1.2.1

# renovate: datasource=github-releases packageName=vmware-tanzu/carvel-vendir
ARG VENDIR_VERSION=0.32.2

# renovate: datasource=github-releases packageName=helmfile/helmfile
ARG HELMFILE_VERSION=0.150.0

# renovate: datasource=github-releases packageName=kubernetes-sigs/kustomize
ARG KUSTOMIZE_VERSION=5.0.0

RUN install-tool vendir "v${VENDIR_VERSION}"

RUN install-tool helmfile "v${HELMFILE_VERSION}"

RUN install-tool kustomize "${KUSTOMIZE_VERSION}"

RUN set -ex; vendir --version

RUN set -ex; helmfile version

RUN set -ex; kustomize version

SHELL [ "/bin/sh", "-c" ]

RUN vendir --version | grep "${VENDIR_VERSION}"

RUN helmfile version | grep "${HELMFILE_VERSION}"

RUN kustomize version | grep "${KUSTOMIZE_VERSION}"

USER 1000

RUN bazel --version

RUN vendir --version | grep "${VENDIR_VERSION}"

RUN helmfile version | grep "${HELMFILE_VERSION}"

RUN kustomize version | grep "${KUSTOMIZE_VERSION}"

#--------------------------------------
# final
#--------------------------------------
FROM base

COPY --from=testa /.dummy /.dummy
COPY --from=testb-gitpod /.dummy /.dummy
COPY --from=testc /.dummy /.dummy
COPY --from=testd /.dummy /.dummy
COPY --from=teste /.dummy /.dummy
