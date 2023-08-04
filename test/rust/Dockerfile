#--------------------------------------
# Image: base
#--------------------------------------
FROM ubuntu:focal as base

RUN touch /.dummy

ARG APT_HTTP_PROXY
ARG CONTAINERBASE_DEBUG

ENV BASH_ENV=/usr/local/etc/env
SHELL ["/bin/bash" , "-c"]

COPY src/ /

RUN install-containerbase

COPY --chown=1000:0 test/rust/test test
WORKDIR /test

RUN prepare-tool rust

#--------------------------------------
# build
#--------------------------------------
FROM base as build

# renovate: datasource=docker versioning=docker
RUN install-tool rust 1.71.1

# renovate: datasource=docker versioning=docker
RUN install-tool rust 1.71.1


USER 1000

#--------------------------------------
# test a: root
#--------------------------------------
FROM build as testa

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
FROM base as testb

USER 1000

# renovate: datasource=docker versioning=docker
RUN install-tool rust 1.71.1

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
