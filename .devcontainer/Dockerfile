FROM containerbase/node:16.17.1@sha256:5cb5c56a006df6492fa042392478a4faaa31ba115e24d2c02796223cac90f7c6

# renovate: datasource=npm
RUN install-tool yarn 1.22.19

USER root
RUN install-apt shellcheck
USER 1000
