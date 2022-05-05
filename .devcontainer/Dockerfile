FROM containerbase/node:16.15.0@sha256:96d21491a75c70038b3eb47d9c33c964082ae4622e6b7f2a78a716c659c1cfe4

# renovate: datasource=npm
RUN install-tool yarn 1.22.18

USER root
RUN install-apt shellcheck
USER 1000
