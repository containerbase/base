FROM containerbase/node:18.12.1@sha256:fe459c9670594c2beb3dfbbd23c51905e6f85c865735f88265790d47bc569a9e

# renovate: datasource=npm
RUN install-tool yarn 1.22.19

USER root
RUN install-apt shellcheck
USER 1000
