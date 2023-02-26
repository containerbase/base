FROM containerbase/node:18.14.2@sha256:5bd153416a969e3eaccaab8c5f9c98c753fbc7d1912e7965a99acea07e0b89aa

# renovate: datasource=npm
RUN install-tool corepack 0.16.0

USER root
RUN install-apt shellcheck
USER 1000
