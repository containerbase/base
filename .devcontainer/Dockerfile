FROM containerbase/node:16.17.0@sha256:f508b7c6080888dd390b61490cf7b41c9eba06547d69454f474caadc82036562

# renovate: datasource=npm
RUN install-tool yarn 1.22.19

USER root
RUN install-apt shellcheck
USER 1000
