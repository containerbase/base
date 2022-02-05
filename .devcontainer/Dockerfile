FROM containerbase/node:17.4.0@sha256:60d1410be81cd2c8abaf70c6081b87938161a4abe623e5f35d2284c2f4c6c2fa

# renovate: datasource=npm
RUN install-tool yarn 1.22.17

USER root
RUN install-apt shellcheck
USER 1000
