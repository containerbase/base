FROM containerbase/node:16.14.2@sha256:95a26ccd09066032d461358235018bb48b79c828c25f89ebd372a142cc767a09

# renovate: datasource=npm
RUN install-tool yarn 1.22.18

USER root
RUN install-apt shellcheck
USER 1000
