FROM ghcr.io/containerbase/node:18.16.0

# renovate: datasource=npm
RUN install-tool corepack 0.18.0

USER root
RUN install-apt shellcheck
USER 1000
