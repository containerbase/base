FROM containerbase/node:18.12.1@sha256:d3a2960fe8c07584f85d974071c0b8687288bdac0d3dede088ff52a1ffff1a45

# renovate: datasource=npm
RUN install-tool yarn 1.22.19

USER root
RUN install-apt shellcheck
USER 1000
