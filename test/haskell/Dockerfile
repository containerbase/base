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

# test openshift compatibility 12021<>1001
COPY --chown=1001:0 test/erlang/test test
WORKDIR /test

#--------------------------------------
# build
#--------------------------------------
FROM base AS build

#RUN prepare-tool cabal

#--------------------------------------
# test: cabal (root)
#--------------------------------------
FROM base AS cabal-a

# renovate: datasource=github-releases packageName=haskell/cabal versioning=docker
RUN install-tool cabal 3.16.1.0


RUN chown -R 12021:0 /test
USER 12021

RUN set -ex; \
  cabal --version; \
  cabal sandbox init; \
  true;


RUN set -ex; \
    ls -la $USER_HOME/; \
    true




#--------------------------------------
# final
#--------------------------------------
FROM base

COPY --from=cabal-a /.dummy /.dummy
