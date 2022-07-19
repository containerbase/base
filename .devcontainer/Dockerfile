FROM containerbase/node:16.16.0@sha256:402b1a0861698d7929c34157563f0c56f4090ca5946783a4e54232813aa77fbf

# renovate: datasource=npm
RUN install-tool yarn 1.22.19

USER root
RUN install-apt shellcheck
USER 1000
