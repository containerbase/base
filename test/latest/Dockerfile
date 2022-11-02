ARG IMAGE=containerbase/buildpack
FROM ${IMAGE} as base

ARG APT_HTTP_PROXY

RUN touch /.dummy


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

ARG APT_HTTP_PROXY

# renovate: datasource=github-releases depName=python packageName=containerbase/python-prebuild
ARG PYTHON_VERSION=3.11.0
RUN install-tool python

RUN set -ex; \
  nginx && su -c 'SSL_CERT_FILE=/test/ca.pem python request.py' ${USER_NAME}

#--------------------------------------
# test: node
#--------------------------------------
FROM build as testc

ARG APT_HTTP_PROXY

# renovate: datasource=node
RUN install-tool node v18.12.0

RUN set -ex; \
  nginx && su -c 'NODE_EXTRA_CA_CERTS=/test/ca.pem node request.mjs' ${USER_NAME}

#--------------------------------------
# test: php
#--------------------------------------
FROM build as testd

ARG APT_HTTP_PROXY

# renovate: datasource=github-releases packageName=containerbase/python-prebuild
RUN install-tool php 7.4.14

RUN set -ex; \
  nginx && su -c 'SSL_CERT_FILE=/test/ca.pem php request.php' ${USER_NAME}


#--------------------------------------
# test: ruby
#--------------------------------------
FROM build as teste

ARG APT_HTTP_PROXY

# Do not renovate ruby 2.x
RUN install-tool ruby 2.6.4

RUN set -ex; \
  nginx && su -c 'SSL_CERT_FILE=/test/ca.pem ruby request.rb' ${USER_NAME}


#--------------------------------------
# test: powershell
#--------------------------------------
FROM build as testf

ARG APT_HTTP_PROXY

# renovate: datasource=github-releases packageName=PowerShell/PowerShell
RUN install-tool powershell v7.2.7

RUN set -ex; cat /etc/hosts; \
  nginx && SSL_CERT_FILE=/test/ca.pem pwsh -c "&{ \$ErrorActionPreference='Stop'; invoke-webrequest https://buildkitsandbox }"

#--------------------------------------
# test: terraform
#--------------------------------------
FROM ubuntu:focal as testg

ARG USER_NAME=terraform
ARG USER_ID=1005
ARG APT_HTTP_PROXY

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
RUN install-tool terraform 1.3.4

WORKDIR /tmp
RUN mkdir $HOME/.tf-cache && TF_PLUGIN_CACHE_DIR=$HOME/.tf-cache terraform init

#--------------------------------------
# test: ignore tools
#--------------------------------------
FROM build as testh

ARG APT_HTTP_PROXY

ARG IGNORED_TOOLS=powershell,node

# renovate: datasource=github-releases packageName=fluxcd/flux2
RUN install-tool flux v0.36.0

# renovate: datasource=github-releases packageName=git-lfs/git-lfs
RUN install-tool git-lfs v3.1.4

# renovate: datasource=github-releases packageName=PowerShell/PowerShell
RUN install-tool powershell v7.2.7

# renovate: datasource=node
RUN install-tool node v18.12.0

# renovate: datasource=github-releases packageName=moby/moby
RUN install-tool docker v20.10.21

#--------------------------------------
# test: bin path has 775
#--------------------------------------
FROM base as testi

ARG APT_HTTP_PROXY
ARG BUILDPACK_DEBUG

RUN [ $(stat --format '%a' "/usr/local/bin") -eq 775 ]

RUN prepare-tool all

RUN set -ex; [ -d /usr/local/erlang ] && echo "works" || exit 1;

#--------------------------------------
# final
#--------------------------------------
FROM ${IMAGE}

COPY --from=testa /.dummy /.dummy
COPY --from=testb /.dummy /.dummy
COPY --from=testc /.dummy /.dummy
COPY --from=testd /.dummy /.dummy
COPY --from=teste /.dummy /.dummy
COPY --from=testf /.dummy /.dummy
COPY --from=testg /.dummy /.dummy
COPY --from=testh /.dummy /.dummy
COPY --from=testi /.dummy /.dummy
