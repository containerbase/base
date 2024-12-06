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

# test openshift compatibility 12021<>1001
COPY --chown=1001:0 test/erlang/test test
WORKDIR /test

#--------------------------------------
# build
#--------------------------------------
FROM base AS build

RUN prepare-tool erlang elixir

#--------------------------------------
# test: erlang (root)
#--------------------------------------
FROM base AS testa

# https://hexdocs.pm/elixir/1.17.0/compatibility-and-deprecations.html#compatibility-between-elixir-and-erlang-otp
# renovate: datasource=github-releases packageName=containerbase/erlang-prebuild versioning=docker
RUN install-tool erlang 27.1.2.0

# renovate: datasource=github-releases packageName=elixir-lang/elixir
RUN install-tool elixir 1.17.3

RUN chown -R 12021:0 /test
USER 12021

RUN set -ex; \
    cd a; \
    mix deps.update --all;

RUN set -ex; \
    ls -la $USER_HOME/; \
    true

#--------------------------------------
# test: erlang (v24,user,openshift)
#--------------------------------------
FROM build AS testb

USER 1001

# https://hexdocs.pm/elixir/1.16.0/compatibility-and-deprecations.html#compatibility-between-elixir-and-erlang-otp
RUN install-tool erlang 24.3.4.17

RUN install-tool elixir 1.16.3


RUN set -ex; \
    cd a; \
    mix deps.update --all;


#--------------------------------------
# test: erlang (v26,user,openshift)
#--------------------------------------
FROM build AS testc

USER 1001

# https://hexdocs.pm/elixir/1.15.0/compatibility-and-deprecations.html#compatibility-between-elixir-and-erlang-otp
RUN install-tool erlang 26.2.5.0

RUN install-tool elixir 1.15.7

RUN set -ex; \
    cd a; \
    mix deps.update --all;

#--------------------------------------
# final
#--------------------------------------
FROM base

COPY --from=testa /.dummy /.dummy
COPY --from=testb /.dummy /.dummy
COPY --from=testc /.dummy /.dummy
