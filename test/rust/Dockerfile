#--------------------------------------
# Image: base
#--------------------------------------
ARG BASE_IMAGE=containerbase/base

FROM ${BASE_IMAGE} as base

RUN touch /.dummy

ARG APT_HTTP_PROXY
ARG CONTAINERBASE_DEBUG
ARG GITHUB_TOKEN

COPY --chown=1000:0 test/rust/test test
WORKDIR /test

RUN prepare-tool rust

#--------------------------------------
# build
#--------------------------------------
FROM base as build

# renovate: datasource=docker versioning=docker
RUN install-tool rust 1.75.0

# renovate: datasource=docker versioning=docker
RUN install-tool rust 1.75.0


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
RUN install-tool rust 1.75.0

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
