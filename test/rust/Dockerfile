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

COPY --chown=12021:0 test/rust/test test
WORKDIR /test

RUN prepare-tool rust

RUN set -ex; ls -la $USER_HOME/; test -L $USER_HOME/.cargo

#--------------------------------------
# build
#--------------------------------------
FROM base AS build

# renovate: datasource=docker versioning=docker
RUN install-tool rust 1.88.0

# renovate: datasource=docker versioning=docker
RUN install-tool rust 1.88.0


USER 12021

#--------------------------------------
# test a: root
#--------------------------------------
FROM build AS testa

RUN set -ex; \
    cd a; \
    cargo update; \
    cargo update --manifest-path Cargo.toml --package serde;

SHELL [ "/bin/sh", "-c" ]
RUN rustc --version
RUN cargo --version

#--------------------------------------
# test b: non-root
#--------------------------------------
FROM base AS testb

USER 12021

# renovate: datasource=docker versioning=docker
RUN install-tool rust 1.88.0

RUN set -ex; \
    cd a; \
    cargo update; \
    cargo update --manifest-path Cargo.toml --package serde;

SHELL [ "/bin/sh", "-c" ]
RUN rustc --version
RUN cargo --version

RUN set -ex; \
  ls -la /tmp/containerbase; \
  ls -la /tmp/containerbase/cache; \
  true

#--------------------------------------
# test c: beta
#--------------------------------------
FROM base AS testc

USER 12021

RUN install-tool rust beta

SHELL [ "/bin/sh", "-c" ]
RUN rustc --version
RUN cargo --version

#--------------------------------------
# test d: nightly
#--------------------------------------
FROM base AS testd

USER 12021

RUN install-tool rust nightly

SHELL [ "/bin/sh", "-c" ]
RUN rustc --version
RUN cargo --version

#--------------------------------------
# final
#--------------------------------------
FROM base

COPY --from=testa /.dummy /.dummy
COPY --from=testb /.dummy /.dummy
COPY --from=testc /.dummy /.dummy
COPY --from=testd /.dummy /.dummy
