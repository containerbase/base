FROM containerbase/node:16.14.2@sha256:d489ba22d5c10d8f59176b8a25491998d31c4dbaab199326633afa1da5f2f5c9

# renovate: datasource=npm
RUN install-tool yarn 1.22.18

USER root
RUN install-apt shellcheck
USER 1000
