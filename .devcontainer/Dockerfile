FROM ghcr.io/containerbase/node:20.9.0

# renovate: datasource=npm
RUN install-tool corepack 0.21.0

USER root
RUN install-apt shellcheck
USER 1000
