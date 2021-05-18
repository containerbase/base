ARG IMAGE=containerbase/buildpack
FROM ${IMAGE}

ARG APT_HTTP_PROXY

# Erlang

#disable renovate: datasource=github-releases lookupName=erlang/otp versioning=loose
RUN install-tool erlang 22.3.2

# Elixir

# renovate: datasource=docker versioning=docker
RUN install-tool elixir 1.11.4

WORKDIR /tmp

COPY --chown=1000:0 test test

USER 1000

RUN set -ex; \
    cd test/a; \
    mix deps.update --all;
