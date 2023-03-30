FROM ghcr.io/containerbase/node:18.15.0

# renovate: datasource=npm
RUN install-tool corepack 0.17.1

USER root
RUN install-apt shellcheck
USER 1000
