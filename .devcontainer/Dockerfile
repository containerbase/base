FROM containerbase/node:18.15.0@sha256:a016596a25881969543284c8e1d54b9ed08175ab03a99520a8950914d60a0acc

# renovate: datasource=npm
RUN install-tool corepack 0.17.0

USER root
RUN install-apt shellcheck
USER 1000
