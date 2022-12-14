FROM containerbase/node:18.12.1@sha256:4fc5d34552236970bf36bf05ffae36e99f78d2c383e7f03cd56dc0500f536cc1

# renovate: datasource=npm
RUN install-tool yarn 1.22.19

USER root
RUN install-apt shellcheck
USER 1000
