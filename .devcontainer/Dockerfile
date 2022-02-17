FROM containerbase/node:16.14.0@sha256:76b1af696269a34596b3c64bd12a2f294e6741d6fca096bb60f5306818953456

# renovate: datasource=npm
RUN install-tool yarn 1.22.17

USER root
RUN install-apt shellcheck
USER 1000
