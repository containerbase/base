FROM containerbase/node:16.15.1@sha256:226600a865f1bd167ee37a6635446e5c7169358c8a30164d8dc0cc3b585d4386

# renovate: datasource=npm
RUN install-tool yarn 1.22.19

USER root
RUN install-apt shellcheck
USER 1000
