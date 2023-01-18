ARG IMAGE=containerbase/buildpack
ARG APT_HTTP_PROXY
ARG GITHUB_TOKEN

#--------------------------------------
FROM ${IMAGE} as base

RUN touch /.dummy

COPY --chown=1000:0 test test

WORKDIR /test

#--------------------------------------
# test: nix 2.10
#--------------------------------------
FROM base as testa


# old nix version, not for renovating
RUN install-tool nix 2.10.0

USER 1000

ARG GITHUB_TOKEN

RUN set -ex; \
  nix --version


RUN set -ex; \
  nix \
    --extra-experimental-features nix-command \
    --extra-experimental-features flakes \
    eval --raw --file flake.nix inputs.nixpkgs.url

RUN set -ex; \
  [ -n "$GITHUB_TOKEN" ] && export NIX_CONFIG="extra-access-tokens = github.com=${GITHUB_TOKEN}"; \
  nix \
    --extra-experimental-features nix-command \
    --extra-experimental-features flakes \
    flake update

#--------------------------------------
# test: nix latest
#--------------------------------------
FROM base as testb


USER 1000

# renovate: datasource=github-tags packageName=NixOS/nix
RUN install-tool nix 2.13.1


ARG GITHUB_TOKEN

RUN set -ex; \
  nix --version

RUN set -ex; \
  nix \
    --extra-experimental-features nix-command \
    --extra-experimental-features flakes \
    eval --raw --file flake.nix inputs.nixpkgs.url

RUN set -ex; \
  [ -n "$GITHUB_TOKEN" ] && export NIX_CONFIG="extra-access-tokens = github.com=${GITHUB_TOKEN}"; \
  nix \
    --extra-experimental-features nix-command \
    --extra-experimental-features flakes \
    flake update

#--------------------------------------
# final
#--------------------------------------
FROM base

COPY --from=testa /.dummy /.dummy
COPY --from=testb /.dummy /.dummy
