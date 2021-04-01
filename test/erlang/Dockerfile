ARG IMAGE=containerbase/buildpack
FROM ${IMAGE}

# Erlang

#disable renovate: datasource=github-releases lookupName=erlang/otp versioning=loose
RUN install-tool erlang 22.3.2

# Elixir

# renovate: datasource=docker versioning=docker
RUN install-tool elixir 1.11.4

WORKDIR /tmp

USER 1000

RUN set -ex; \
    git clone --depth=1 https://github.com/containerbase/test-erlang1.git; \
    cd test-erlang1; \
    mix deps.update --all; \
    git status -s;
