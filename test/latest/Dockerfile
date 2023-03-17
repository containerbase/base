#--------------------------------------
# base
#--------------------------------------
FROM containerbase/test as base

ARG APT_HTTP_PROXY
ARG BUILDPACK_DEBUG

RUN touch /.dummy

#--------------------------------------
# build
#--------------------------------------
FROM base as build

# install nginx for request testing
RUN install-apt nginx

COPY src/ /

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
# test: curl
#--------------------------------------
FROM build as testa

RUN set -ex; \
  openssl x509 -noout -text -in ca.pem; \
  openssl x509 -noout -text -in renovate.pem;

RUN set -ex; \
  nginx \
  && su -c 'SSL_CERT_FILE=/test/ca.pem curl -svo /dev/null https://localhost' ${USER_NAME} \
  && su -c 'SSL_CERT_FILE=/test/ca.pem curl -svo /dev/null https://buildkitsandbox' ${USER_NAME}

# install root ca
RUN  set -ex \
  && cp ca.pem /usr/local/share/ca-certificates/renovate-ca.crt \
  && update-ca-certificates

# use global root certs
RUN set -ex; \
  nginx \
  && su -c 'curl -svo /dev/null https://buildkitsandbox' ${USER_NAME}

#--------------------------------------
# test: python
#--------------------------------------
FROM build as testb

# renovate: datasource=github-releases depName=python packageName=containerbase/python-prebuild
ARG PYTHON_VERSION=3.11.2
RUN install-tool python

RUN set -ex; [ $(stat --format '%u' "/usr/local/bin/python") -eq ${USER_ID} ]

RUN set -ex; \
  nginx && su -c 'SSL_CERT_FILE=/test/ca.pem python request.py' ${USER_NAME}

#--------------------------------------
# test: node
#--------------------------------------
FROM build as testc

# renovate: datasource=node
RUN install-tool node v18.15.0

RUN set -ex; \
  nginx && su -c 'NODE_EXTRA_CA_CERTS=/test/ca.pem node request.mjs' ${USER_NAME}

#--------------------------------------
# test: php
#--------------------------------------
FROM build as testd

# renovate: datasource=github-releases packageName=containerbase/python-prebuild
RUN install-tool php 7.4.14

RUN set -ex; [ $(stat --format '%u' "/usr/local/bin/php") -eq ${USER_ID} ]

RUN set -ex; \
  nginx && su -c 'SSL_CERT_FILE=/test/ca.pem php request.php' ${USER_NAME}


#--------------------------------------
# test: ruby
#--------------------------------------
FROM build as teste

# Do not renovate ruby 2.x
RUN install-tool ruby 2.6.4

RUN set -ex; [ $(stat --format '%u' "/usr/local/bin/ruby") -eq ${USER_ID} ]

RUN set -ex; \
  nginx && su -c 'SSL_CERT_FILE=/test/ca.pem ruby request.rb' ${USER_NAME}


#--------------------------------------
# test: powershell
#--------------------------------------
FROM build as testf

# renovate: datasource=github-releases packageName=PowerShell/PowerShell
RUN install-tool powershell v7.3.3

RUN set -ex; cat /etc/hosts; \
  nginx && SSL_CERT_FILE=/test/ca.pem pwsh -c "&{ \$ErrorActionPreference='Stop'; invoke-webrequest https://buildkitsandbox }"

#--------------------------------------
# test: terraform
#--------------------------------------
FROM ubuntu:focal as testg

ARG USER_NAME=terraform
ARG USER_ID=1005
ARG APT_HTTP_PROXY
ARG BUILDPACK_DEBUG

# Set env and shell
ENV BASH_ENV=/usr/local/etc/env PATH=/home/$USER_NAME/bin:$PATH
SHELL ["/bin/bash" , "-c"]

COPY --from=build /test/ca.pem /usr/local/share/ca-certificates/renovate-ca.crt

# Set up buildpack
COPY --from=build /usr/local/bin/ /usr/local/bin/
COPY --from=build /usr/local/buildpack/ /usr/local/buildpack/
RUN install-buildpack

# validate custom cert
COPY --from=build /test/renovate.pem /renovate.pem
RUN openssl verify /renovate.pem

# Test start
RUN touch /.dummy

USER ${USER_ID}

SHELL ["/bin/sh", "-c"]

# renovate: datasource=docker packageName=hashicorp/terraform versioning=docker
RUN install-tool terraform 1.4.2

WORKDIR /tmp
RUN mkdir $HOME/.tf-cache && TF_PLUGIN_CACHE_DIR=$HOME/.tf-cache terraform init

#--------------------------------------
# test: ignore tools
#--------------------------------------
FROM build as testh

RUN prepare-tool docker

USER 1000

ARG IGNORED_TOOLS=powershell,node

# renovate: datasource=github-releases packageName=fluxcd/flux2
RUN install-tool flux v0.41.1

# renovate: datasource=github-releases packageName=git-lfs/git-lfs
RUN install-tool git-lfs v3.3.0

# renovate: datasource=github-releases packageName=PowerShell/PowerShell
RUN install-tool powershell v7.3.3

# renovate: datasource=node
RUN install-tool node v18.15.0

# renovate: datasource=github-releases packageName=moby/moby
RUN install-tool docker v23.0.1

#--------------------------------------
# test: bin path has 775
#--------------------------------------
FROM base as testi

RUN [ $(stat --format '%a' "/usr/local/bin") -eq 775 ]

RUN prepare-tool all

RUN set -ex; [ -d /usr/local/erlang ] && echo "works" || exit 1;

#--------------------------------------
# test: vendir, helmfile, kustomize
#--------------------------------------
FROM base as testj

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

RUN vendir --version | grep "${VENDIR_VERSION}"

RUN helmfile version | grep "${HELMFILE_VERSION}"

RUN kustomize version | grep "${KUSTOMIZE_VERSION}"


#--------------------------------------
# final
#--------------------------------------
FROM base

COPY --from=testa /.dummy /.dummy
COPY --from=testb /.dummy /.dummy
COPY --from=testc /.dummy /.dummy
COPY --from=testd /.dummy /.dummy
COPY --from=teste /.dummy /.dummy
COPY --from=testf /.dummy /.dummy
COPY --from=testg /.dummy /.dummy
COPY --from=testh /.dummy /.dummy
COPY --from=testi /.dummy /.dummy
COPY --from=testj /.dummy /.dummy
