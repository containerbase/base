ARG IMAGE=containerbase/buildpack
FROM ${IMAGE} as build

# renovate: datasource=github-releases lookupName=NixOS/nix
RUN install-tool nix 2.3.10

USER 1000

RUN set -ex; \
  nix --version

RUN set -ex; \
  nix-instantiate --eval -E '(import <nixpkgs> {}).lib.version'

RUN set -ex; \
  nix-instantiate --eval -E 'with import <nixpkgs> {}; glibc.version'
