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
COPY --chown=1001:0 test/haskell/test test
WORKDIR /test

#--------------------------------------
# build
#--------------------------------------
FROM base AS build

RUN prepare-tool cabal ghc

#--------------------------------------
# test: haskell (root,open-shift)
#--------------------------------------
FROM base AS haskell-a

RUN env
# renovate: datasource=docker packageName=haskell
RUN install-tool ghc 9.14.1

# renovate: datasource=github-releases packageName=haskell/cabal versioning=docker
RUN install-tool cabal 3.16.1.0


USER 1001

RUN set -ex; \
  cabal --version; \
  cd a; \
  cabal list --installed; \
  true;


RUN set -ex; \
    ls -la $USER_HOME/; \
    true


#--------------------------------------
# test: haskell (rootless)
#--------------------------------------
FROM build AS haskell-b

RUN chown -R 12021:0 /test

USER 12021

# renovate: datasource=docker packageName=haskell
RUN install-tool ghc 9.14.1

# renovate: datasource=github-releases packageName=haskell/cabal versioning=docker
RUN install-tool cabal 3.16.1.0


RUN set -ex; \
  cabal --version; \
  cd a; \
  cabal list --installed; \
  cabal update; \
  true;


RUN set -ex; \
    ls -la $USER_HOME/; \
    true

#--------------------------------------
# final
#--------------------------------------
FROM base

COPY --from=haskell-a /.dummy /.dummy
COPY --from=haskell-b /.dummy /.dummy
