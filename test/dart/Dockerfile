ARG BASE_IMAGE=containerbase

#--------------------------------------
# Image: containerbase
#--------------------------------------
FROM ghcr.io/containerbase/ubuntu:20.04 AS containerbase

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

COPY --chown=12021:0 test/dart/test test
WORKDIR /test

#--------------------------------------
# build
#--------------------------------------
FROM base AS build

RUN prepare-tool dart

#--------------------------------------
# test: dart 3.x (non-root)
#--------------------------------------
FROM build AS testa

USER 12021

# renovate: datasource=docker
RUN install-tool dart 3.5.4

RUN set -ex; \
    cd a; \
    dart pub upgrade;

RUN set -ex; \
  ls -la $USER_HOME; \
  true

#--------------------------------------
# test: dart 3.x (root, openstack)
#--------------------------------------
FROM base AS testb

# renovate: datasource=docker
RUN install-tool dart 3.5.4

# fix test file perms for openstack
RUN chown -R 1001 .

USER 1001

RUN set -ex; \
    cd a; \
    dart pub upgrade;

#--------------------------------------
# test: dart 2.x (non-root)
#--------------------------------------
FROM build AS testc

USER 12021

# renovate: datasource=docker
RUN install-tool dart 2.19.6

RUN set -ex; \
    cd a; \
    dart pub upgrade;

RUN set -ex; \
  ls -la $USER_HOME; \
  true

#--------------------------------------
# final
#--------------------------------------
FROM base

COPY --from=testa /.dummy /.dummy
COPY --from=testb /.dummy /.dummy
COPY --from=testc /.dummy /.dummy
