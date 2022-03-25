FROM containerbase/node:16.14.2@sha256:38a6a24c7cdb3f52789028a1da3c371f3457478d9551dc2cd1e40007b99ba046

# renovate: datasource=npm
RUN install-tool yarn 1.22.17

USER root
RUN install-apt shellcheck
USER 1000
