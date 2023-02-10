ARG IMAGE=containerbase/base
ARG BUILDPACK_DEBUG

FROM ${IMAGE} as base

RUN touch /.dummy

COPY --chown=1000:0 test test

WORKDIR /test

ARG BUILDPACK_DEBUG

RUN prepare-tool rust

FROM base as build
ARG BUILDPACK_DEBUG

# renovate: datasource=docker versioning=docker
RUN install-tool rust 1.67.1

# renovate: datasource=docker versioning=docker
RUN install-tool rust 1.67.1


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
ARG BUILDPACK_DEBUG

USER 1000

# renovate: datasource=docker versioning=docker
RUN install-tool rust 1.67.1

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
