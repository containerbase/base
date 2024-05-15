#--------------------------------------
# Image: base
#--------------------------------------
FROM ubuntu:focal as base

RUN touch /.dummy

ARG APT_HTTP_PROXY
ARG CONTAINERBASE_DEBUG

ENV BASH_ENV=/usr/local/etc/env
SHELL ["/bin/bash" , "-c"]

ARG TARGETARCH

COPY dist/docker/ /
COPY dist/cli/containerbase-cli-${TARGETARCH} /usr/local/containerbase/bin/containerbase-cli

RUN install-containerbase

# test openshift compatibility 1000<>1001
COPY --chown=1001:0 test/erlang/test test
WORKDIR /test

#--------------------------------------
# build
#--------------------------------------
FROM base as build

RUN prepare-tool erlang

#--------------------------------------
# test: erlang (root)
#--------------------------------------
FROM base as testa

# https://hexdocs.pm/elixir/1.15.0/compatibility-and-deprecations.html#compatibility-between-elixir-and-erlang-otp
# renovate: datasource=github-releases packageName=containerbase/erlang-prebuild versioning=docker
RUN install-tool erlang 26.2.5.0

# renovate: datasource=docker versioning=docker
RUN install-tool elixir 1.16.2


USER 1001

RUN set -ex; \
    cd a; \
    mix deps.update --all;


#--------------------------------------
# test: erlang (v24,user,openshift)
#--------------------------------------
FROM build as testb

USER 1001

# https://hexdocs.pm/elixir/1.15.0/compatibility-and-deprecations.html#compatibility-between-elixir-and-erlang-otp
# no major update, pin elixir if newer version doesn't support v24
# renovate: datasource=github-releases packageName=containerbase/erlang-prebuild versioning=docker
RUN install-tool erlang 24.3.4.17

# renovate: datasource=docker versioning=docker
RUN install-tool elixir 1.16.2


RUN set -ex; \
    cd a; \
    mix deps.update --all;


#--------------------------------------
# test: erlang (v22,user,openshift)
#--------------------------------------
FROM build as testc

USER 1001

# https://hexdocs.pm/elixir/1.13.4/compatibility-and-deprecations.html#compatibility-between-elixir-and-erlang-otp
# no major update, pin elixir if newer version doesn't support v22
# renovate: datasource=github-releases packageName=containerbase/erlang-prebuild versioning=docker
RUN install-tool erlang 22.3.4.27

RUN install-tool elixir 1.13.4

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
