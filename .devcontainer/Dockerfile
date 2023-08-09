FROM ghcr.io/containerbase/node:18.17.1

# renovate: datasource=npm
RUN install-tool corepack 0.19.0

USER root
RUN install-apt shellcheck
USER 1000
