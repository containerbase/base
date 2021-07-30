ARG IMAGE=containerbase/buildpack
FROM ${IMAGE} as build

ARG APT_HTTP_PROXY

RUN touch /.dummy

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

# renovate: datasource=github-releases depName=containerbase/python-prebuild
ARG PYTHON_VERSION=3.9.6
RUN install-tool python

RUN set -ex; \
  nginx && su -c 'SSL_CERT_FILE=/test/ca.pem python request.py' ${USER_NAME}

#--------------------------------------
# test: node
#--------------------------------------
FROM build as testc

ARG APT_HTTP_PROXY

# renovate: datasource=docker versioning=docker
RUN install-tool node 14.17.3

RUN set -ex; \
  nginx && su -c 'SSL_CERT_FILE=/test/ca.pem node request.mjs' ${USER_NAME}

#--------------------------------------
# test: php
#--------------------------------------
FROM build as testd

ARG APT_HTTP_PROXY

# renovate: datasource=github-releases lookupName=containerbase/python-prebuild
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

# renovate: datasource=github-releases lookupName=PowerShell/PowerShell
RUN install-tool powershell v7.1.3

RUN set -ex; cat /etc/hosts; \
  nginx && SSL_CERT_FILE=/test/ca.pem pwsh -c "&{ \$ErrorActionPreference='Stop'; invoke-webrequest https://buildkitsandbox }"

#--------------------------------------
# test: terraform
#--------------------------------------
FROM ubuntu:20.04@sha256:cf31af331f38d1d7158470e095b132acd126a7180a54f263d386da88eb681d93 as testg

ARG USER_NAME=terraform
ARG USER_ID=1005
ARG APT_HTTP_PROXY

# Set env and shell
ENV BASH_ENV=/usr/local/etc/env
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

# renovate: datasource=docker lookupName=hashicorp/terraform versioning=docker
RUN install-tool terraform 1.0.3

USER ${USER_ID}

WORKDIR /tmp
RUN mkdir $HOME/.tf-cache && TF_PLUGIN_CACHE_DIR=$HOME/.tf-cache terraform init

#--------------------------------------
# test: ignore tools
#--------------------------------------
FROM build as testh

ARG APT_HTTP_PROXY

ARG IGNORED_TOOLS=powershell,node

# renovate: datasource=github-releases lookupName=git-lfs/git-lfs
RUN install-tool git-lfs v2.13.3

# renovate: datasource=github-releases lookupName=PowerShell/PowerShell
RUN install-tool powershell v7.1.3

# renovate: datasource=docker versioning=docker
RUN install-tool node 14.17.3

# renovate: datasource=github-releases lookupName=moby/moby
RUN install-tool docker 20.10.7

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
