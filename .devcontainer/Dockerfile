FROM containerbase/node:18.15.0@sha256:a396d1d81320ac5dc75973fe6f2b7f940d9f1523aac305d0997b58ffc52ad885

# renovate: datasource=npm
RUN install-tool corepack 0.17.1

USER root
RUN install-apt shellcheck
USER 1000
