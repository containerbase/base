ARG IMAGE=containerbase/buildpack
FROM ${IMAGE} as base

RUN touch /.dummy

COPY --chown=1000:0 test test

WORKDIR /test

#--------------------------------------
# test: nix 2.10
#--------------------------------------
FROM base as testa

ARG APT_HTTP_PROXY

# old nix version, not for renovating
RUN install-tool nix 2.11.1

USER 1000

RUN set -ex; \
  nix --version

RUN set -ex; \
  cd a; \
  nix \
    --extra-experimental-features nix-command \
    --extra-experimental-features flakes \
    eval --impure --expr '{example = import ./flake.nix;}'

RUN set -ex; \
  cd a; \
  nix \
    --extra-experimental-features nix-command \
    --extra-experimental-features flakes \
    flake update

#--------------------------------------
# test: nix 2.11
#--------------------------------------
FROM base as testa

ARG APT_HTTP_PROXY

# renovate: datasource=github-tags packageName=NixOS/nix
RUN install-tool nix 2.11.1

USER 1000

RUN set -ex; \
  nix --version

RUN set -ex; \
  cd a; \
  nix \
    --extra-experimental-features nix-command \
    --extra-experimental-features flakes \
    eval --impure --expr '{example = import ./flake.nix;}'

RUN set -ex; \
  cd a; \
  nix \
    --extra-experimental-features nix-command \
    --extra-experimental-features flakes \
    flake update
