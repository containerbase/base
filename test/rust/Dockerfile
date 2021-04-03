ARG IMAGE=containerbase/buildpack
FROM ${IMAGE} as build

# renovate: datasource=docker versioning=docker
RUN install-tool rust 1.51.0

# renovate: datasource=docker versioning=docker
RUN install-tool rust 1.51.0

WORKDIR /tmp

USER 1000


RUN set -ex; \
    git clone --depth=1 https://github.com/renovate-tests/cargo1; \
    cd cargo1; \
    cargo update; \
    git status -s

RUN set -ex; \
    git clone --depth=1 https://github.com/renovate-tests/tikv; \
    cd tikv; \
    cargo update --manifest-path Cargo.toml --package fail; \
    git status -s

SHELL [ "/bin/sh", "-c" ]
RUN rustc --version
RUN cargo --version
