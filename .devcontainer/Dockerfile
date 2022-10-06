FROM containerbase/node:16.17.1@sha256:c3021b6d64b9996431528c05caafc30bd368d0e6e8c8842d6b5a9add37e57fd2

# renovate: datasource=npm
RUN install-tool yarn 1.22.19

USER root
RUN install-apt shellcheck
USER 1000
