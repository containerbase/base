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

COPY --chown=12021:0 test/nix/test test
WORKDIR /test

#--------------------------------------
# test: nix 2.10
#--------------------------------------
FROM base AS testa

# old nix version, not for renovating
RUN install-tool nix 2.10.3

USER 12021

RUN set -ex; \
  nix --version


RUN set -ex; \
  nix \
    --extra-experimental-features nix-command \
    --extra-experimental-features flakes \
    eval --raw --file flake.nix inputs.nixpkgs.url

RUN --mount=type=secret,id=GITHUB_TOKEN,uid=12021 \
  set -ex; \
  [ -f /run/secrets/GITHUB_TOKEN ] && export NIX_CONFIG="access-tokens = github.com=$(cat /run/secrets/GITHUB_TOKEN)"; \
  nix \
    --extra-experimental-features nix-command \
    --extra-experimental-features flakes \
    flake update

#--------------------------------------
# test: nix latest
#--------------------------------------
FROM base AS testb


USER 12021

# renovate: datasource=github-tags packageName=NixOS/nix
RUN install-tool nix 2.24.10

RUN set -ex; \
  nix --version

RUN set -ex; \
  nix \
    --extra-experimental-features nix-command \
    --extra-experimental-features flakes \
    eval --raw --file flake.nix inputs.nixpkgs.url


RUN --mount=type=secret,id=GITHUB_TOKEN,uid=12021 \
  set -ex; \
  [ -f /run/secrets/GITHUB_TOKEN ] && export NIX_CONFIG="access-tokens = github.com=$(cat /run/secrets/GITHUB_TOKEN)"; \
  nix \
    --extra-experimental-features nix-command \
    --extra-experimental-features flakes \
    flake update

RUN set -ex; \
  ls -la $USER_HOME; \
  true
#--------------------------------------
# final
#--------------------------------------
FROM base

COPY --from=testa /.dummy /.dummy
COPY --from=testb /.dummy /.dummy
