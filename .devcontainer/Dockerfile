FROM containerbase/node:18.14.2@sha256:610968ff3eedf7f914d7fbc8aef1e6c8e3e2e13d8c23fe075d085ec03ea28554

# renovate: datasource=npm
RUN install-tool corepack 0.17.0

USER root
RUN install-apt shellcheck
USER 1000
