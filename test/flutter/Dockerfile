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
RUN install-tool git v2.46.0

#--------------------------------------
# Image: base
#--------------------------------------
FROM ${BASE_IMAGE} AS base

RUN touch /.dummy

ARG APT_HTTP_PROXY
ARG CONTAINERBASE_CDN
ARG CONTAINERBASE_DEBUG
ARG CONTAINERBASE_LOG_LEVEL

COPY --chown=1000:0 test/flutter/test test
WORKDIR /test

#--------------------------------------
# build
#--------------------------------------
FROM base AS build

RUN prepare-tool flutter

#--------------------------------------
# test: flutter 2.x (non-root)
#--------------------------------------
FROM build AS testa

USER 1000

# EOL
RUN install-tool flutter 2.10.5

RUN set -ex; \
    cd c; \
    flutter pub upgrade;

#--------------------------------------
# test: flutter 3.x (non-root)
#--------------------------------------
FROM build AS testb

USER 1000

# renovate: datasource=github-releases packageName=containerbase/flutter-prebuild
RUN install-tool flutter 3.24.2

RUN set -ex; \
    cd d; \
    flutter pub upgrade;

#--------------------------------------
# test: flutter 3.x (non-root, openshift)
#--------------------------------------
FROM build AS testc

# fix test file perms for openstack
RUN chown -R 1001 .

USER 1001

# renovate: datasource=github-releases packageName=containerbase/flutter-prebuild
RUN install-tool flutter 3.24.2

RUN set -ex; \
    cd d; \
    flutter pub upgrade;

RUN set -ex; \
  ls -la $USER_HOME; \
  cat $USER_HOME/.flutter_tool_state; \
  cat $USER_HOME/.flutter; \
  cat $USER_HOME/.dart-tool/dart-flutter-telemetry.config; \
  true

#--------------------------------------
# final
#--------------------------------------
FROM base

COPY --from=testa /.dummy /.dummy
COPY --from=testb /.dummy /.dummy
COPY --from=testc /.dummy /.dummy
