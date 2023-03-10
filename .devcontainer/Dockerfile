FROM containerbase/node:18.15.0@sha256:8dac04e5d94c0ee0680ba225e1b2fa495b33f2e8de1c975f8f7e80844226a63f

# renovate: datasource=npm
RUN install-tool corepack 0.17.0

USER root
RUN install-apt shellcheck
USER 1000
