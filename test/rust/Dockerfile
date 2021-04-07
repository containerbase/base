ARG IMAGE=containerbase/buildpack
FROM ${IMAGE} as build

# renovate: datasource=docker versioning=docker
RUN install-tool rust 1.51.0

# renovate: datasource=docker versioning=docker
RUN install-tool rust 1.51.0

WORKDIR /tmp

COPY --chown=1000:0 test test

USER 1000


RUN set -ex; \
    cd test/a; \
    cargo update; \
    cargo update --manifest-path Cargo.toml --package serde;

SHELL [ "/bin/sh", "-c" ]
RUN rustc --version
RUN cargo --version
