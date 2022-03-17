FROM containerbase/node:16.14.1@sha256:a9b1c45ecf3fd67fc131859385d1d0d48ec7a23b63d309e71cc5ac864bf0c00b

# renovate: datasource=npm
RUN install-tool yarn 1.22.17

USER root
RUN install-apt shellcheck
USER 1000
