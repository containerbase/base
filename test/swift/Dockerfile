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

# TODO: move to prepare
# renovate: datasource=github-tags packageName=git/git
RUN install-tool git v2.46.2

#--------------------------------------
# Image: base
#--------------------------------------
FROM ${BASE_IMAGE} AS base

RUN touch /.dummy

ARG APT_HTTP_PROXY
ARG CONTAINERBASE_CDN
ARG CONTAINERBASE_DEBUG
ARG CONTAINERBASE_LOG_LEVEL

COPY --chown=12021:0 test/swift/test test
WORKDIR /test

#--------------------------------------
# build
#--------------------------------------
FROM base AS build

# renovate: datasource=docker versioning=docker
RUN install-tool swift 6.0.1

#--------------------------------------
# testa: swift latest
#--------------------------------------
FROM build AS testa

USER 12021

RUN swift --version

RUN set -ex; \
  cd a; \
  swift package resolve

RUN set -ex; \
  cd b; \
  swift package resolve

RUN set -ex; \
  cd c; \
  swift package resolve

RUN set -ex; \
  ls -la $USER_HOME/; \
  true

SHELL [ "/bin/sh", "-c" ]
RUN swift --version


#--------------------------------------
# testb: swift 5.7.3 (non-root)
#--------------------------------------
FROM build AS testb

USER 12021

RUN install-tool swift 5.7.3

RUN set -ex; swift --version | grep 5.7.3

RUN set -ex; \
  cd c; \
  swift package resolve

#--------------------------------------
# final
#--------------------------------------
FROM base

COPY --from=testa /.dummy /.dummy
COPY --from=testb /.dummy /.dummy
