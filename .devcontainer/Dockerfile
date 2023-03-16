FROM containerbase/node:18.15.0@sha256:5c0dbacb3043a43551df6c79b6c34ee99d31edb0e063080fc8d85d19759f3c97

# renovate: datasource=npm
RUN install-tool corepack 0.17.0

USER root
RUN install-apt shellcheck
USER 1000
