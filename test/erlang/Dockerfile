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

# https://hexdocs.pm/elixir/1.14.0/compatibility-and-deprecations.html#compatibility-between-elixir-and-erlang-otp
# renovate: datasource=github-releases packageName=containerbase/erlang-prebuild versioning=docker
RUN install-tool erlang 25.3.2.2

# renovate: datasource=docker versioning=docker
RUN install-tool elixir 1.15.1


USER 1001

RUN set -ex; \
    cd a; \
    mix deps.update --all;


#--------------------------------------
# test: erlang (v24,user,openshift)
#--------------------------------------
FROM build as testb

USER 1001

# https://hexdocs.pm/elixir/1.14.0/compatibility-and-deprecations.html#compatibility-between-elixir-and-erlang-otp
# no major update, pin elixir if newer version doesn't support v24
# renovate: datasource=github-releases packageName=containerbase/erlang-prebuild versioning=docker
RUN install-tool erlang 24.3.4.12

# renovate: datasource=docker versioning=docker
RUN install-tool elixir 1.15.1


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
RUN install-tool erlang 22.3.4.26

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
