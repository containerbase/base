ARG IMAGE=containerbase/buildpack
FROM ${IMAGE}

ARG APT_HTTP_PROXY

# Erlang

# renovate: datasource=github-releases lookupName=containerbase/erlang-prebuild versioning=docker
RUN install-tool erlang 22.3.4.24

# Elixir

# renovate: datasource=docker versioning=docker
RUN install-tool elixir 1.13.3

# test openshift compatibility 1000<>1001
COPY --chown=1001:0 test test

WORKDIR /test

USER 1001

RUN set -ex; \
    cd a; \
    mix deps.update --all;
