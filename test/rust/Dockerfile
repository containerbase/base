#--------------------------------------
# Image: base
#--------------------------------------
FROM ghcr.io/containerbase/ubuntu:20.04 AS base

RUN touch /.dummy

ARG APT_HTTP_PROXY
ARG CONTAINERBASE_CDN
ARG CONTAINERBASE_DEBUG

ENV BASH_ENV=/usr/local/etc/env
SHELL ["/bin/bash" , "-c"]

ARG TARGETARCH

COPY dist/docker/ /
COPY dist/cli/containerbase-cli-${TARGETARCH} /usr/local/containerbase/bin/containerbase-cli

RUN install-containerbase

COPY --chown=1000:0 test/rust/test test
WORKDIR /test

RUN prepare-tool rust

RUN set -ex; ls -la $USER_HOME/; test -L $USER_HOME/.cargo

#--------------------------------------
# build
#--------------------------------------
FROM base AS build

# renovate: datasource=docker versioning=docker
RUN install-tool rust 1.80.0

# renovate: datasource=docker versioning=docker
RUN install-tool rust 1.80.0


USER 1000

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

USER 1000

# renovate: datasource=docker versioning=docker
RUN install-tool rust 1.80.0

RUN set -ex; \
    cd a; \
    cargo update; \
    cargo update --manifest-path Cargo.toml --package serde;

SHELL [ "/bin/sh", "-c" ]
RUN rustc --version
RUN cargo --version

#--------------------------------------
# final
#--------------------------------------
FROM base

COPY --from=testa /.dummy /.dummy
COPY --from=testb /.dummy /.dummy
