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

COPY --chown=12021:0 test/julia/test test
WORKDIR /test

RUN prepare-tool julia

RUN set -ex; ls -la $USER_HOME/; test -L $USER_HOME/.julia

#--------------------------------------
# test a: root
#--------------------------------------
FROM base AS testa

# renovate: datasource=github-releases packageName=JuliaLang/julia
RUN install-tool julia v1.13.3

USER 12021

RUN set -ex; julia --version | grep 1.13.3

RUN set -ex; \
  cd a; \
  julia --startup-file=no --history-file=no --project=. -e 'import Pkg; Pkg.update(["Example"])'; \
  ! grep -q '"0.5.4"' Manifest.toml || exit 1; \
  test -f $USER_HOME/.julia/registries/General.toml

SHELL [ "/bin/sh", "-c" ]
RUN julia --version

#--------------------------------------
# test b: non-root, oldest version
#--------------------------------------
FROM base AS testb

USER 12021

RUN install-tool julia 1.6.7

RUN set -ex; julia --version | grep 1.6.7

#--------------------------------------
# final
#--------------------------------------
FROM base

COPY --from=testa /.dummy /.dummy
COPY --from=testb /.dummy /.dummy
