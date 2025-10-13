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

COPY --chown=12021:0 test/jb/test test
WORKDIR /test

#--------------------------------------
# build
#--------------------------------------
FROM base AS build

USER 12021

# renovate: datasource=github-releases packageName=jsonnet-bundler/jsonnet-bundler
RUN install-tool jb v0.6.0


#--------------------------------------
# test: jb install
#--------------------------------------

FROM build AS testa

RUN set -ex; \
  jb install; \
  test -d vendor/github.com/prometheus-operator/prometheus-operator; \
  test -d vendor/prometheus-operator

#--------------------------------------
# test: jb uninstall
#--------------------------------------

FROM build AS testb


# renovate: datasource=github-releases depName=jb packageName=jsonnet-bundler/jsonnet-bundler
ENV JB_VERSION=0.6.0
RUN uninstall-tool jb ${JB_VERSION}
RUN if command -v jb; then echo "jb not uninstalled" >&2; exit 1; fi

#--------------------------------------
# final
#--------------------------------------
FROM base

COPY --from=testa /.dummy /.dummy
COPY --from=testb /.dummy /.dummy
